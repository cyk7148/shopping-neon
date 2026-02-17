const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// 連接 Neon 資料庫
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.static(path.join(__dirname, '../frontend')));

// 1. [修復點] 每日簽到 API：包含 10 分獎勵與紀錄
app.post('/api/daily-signin', async (req, res) => {
    try {
        const { email } = req.body;
        // 利用資料庫原子性更新，判斷 last_signin_date 確保一天只能領一次
        const result = await pool.query(
            `UPDATE users SET points = points + 10, last_signin_date = CURRENT_DATE 
             WHERE email = $1 AND (last_signin_date IS NULL OR last_signin_date < CURRENT_DATE)`,
            [email]
        );

        if (result.rowCount > 0) {
            // 簽到成功，寫入積分流水帳
            await pool.query(
                'INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, 10, $2)',
                [email, '🐎 馬年每日簽到獎勵']
            );
            const up = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
            res.json({ message: "OK", newTotal: Number(up.rows[0].points) });
        } else {
            res.status(400).json({ error: "今天已經簽到過囉！" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("簽到系統異常");
    }
});

// 2. 始版刮刮樂邏輯：單次扣除 10 積分
app.post('/api/scratch-win', async (req, res) => {
    const { email } = req.body;
    try {
        const userRes = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        const currentPoints = Number(userRes.rows[0].points);
        if (currentPoints < 10) return res.status(400).json({ error: "霸氣不足！需要 10 積分" });

        const prizes = (await pool.query('SELECT * FROM scratch_prizes')).rows;
        const totalW = prizes.reduce((s, p) => s + p.weight, 0);
        let r = Math.floor(Math.random() * totalW), sel = prizes[0];
        for (const p of prizes) { if (r < p.weight) { sel = p; break; } r -= p.weight; }

        // 紀錄：消耗 10 分
        await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, -10, $2)', [email, '🧧 參與霸氣刮刮樂消耗']);
        if (sel.points_reward > 0) {
            await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)', [email, sel.points_reward, `🧧 刮中項：${sel.name}`]);
            if (sel.points_reward >= 880000) await pool.query('UPDATE users SET has_won_jackpot = TRUE WHERE email = $1', [email]);
        }

        await pool.query('UPDATE users SET points = points - 10 + $1 WHERE email = $2', [sel.points_reward, email]);
        const updated = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        res.json({ prizeName: sel.name, newTotal: Number(updated.rows[0].points) });
    } catch (err) { res.status(500).send("抽獎錯誤"); }
});

// 3. 結帳與 1% 回饋邏輯
app.post('/api/checkout', async (req, res) => {
    const { email, total, products, image_url } = req.body;
    try {
        const reward = Math.floor(Number(total) * 0.01);
        await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, total, image_url]);
        if (reward > 0) {
            await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)', [email, reward, '🐎 結帳回饋 1%']);
            await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [reward, email]);
        }
        const updated = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        res.json({ message: "OK", reward, newTotal: Number(updated.rows[0].points) });
    } catch (e) { res.status(500).send("結帳錯誤"); }
});

// 4. 基礎同步 API：支援始版 points_history 面板
app.get('/api/points-history', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM points_history WHERE user_email = $1 ORDER BY created_at DESC LIMIT 50', [req.query.email]);
        res.json(r.rows);
    } catch (e) { res.status(500).send(); }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (r.rows.length > 0) {
            if (await bcrypt.compare(password, r.rows[0].password)) return res.json({ ...r.rows[0], points: Number(r.rows[0].points) });
            return res.status(401).send();
        } else {
            const hash = await bcrypt.hash(password, 10);
            const n = await pool.query('INSERT INTO users (email, password) VALUES ($1,$2) RETURNING *', [email, hash]);
            res.json({ ...n.rows[0], points: 0 });
        }
    } catch (e) { res.status(500).send(); }
});

app.post('/api/get-user', async (req, res) => {
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
    res.json({ ...r.rows[0], points: Number(r.rows[0].points) });
});

app.post('/api/update-profile', async (req, res) => {
    const { email, username, bio, password } = req.body;
    try {
        if (password) {
            const h = await bcrypt.hash(password, 10);
            await pool.query('UPDATE users SET username=$1, bio=$2, password=$3, is_profile_updated=TRUE WHERE email=$4', [username, bio, h, email]);
        } else await pool.query('UPDATE users SET username=$1, bio=$2, is_profile_updated=TRUE WHERE email=$3', [username, bio, email]);
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send(); }
});

app.get('/api/products', async (req, res) => res.json((await pool.query('SELECT * FROM products ORDER BY id ASC')).rows));
app.get('/api/orders', async (req, res) => res.json((await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email])).rows));
app.get('/api/winners', async (req, res) => res.json((await pool.query('SELECT username, bio FROM users WHERE has_won_jackpot = TRUE ORDER BY id DESC')).rows));

app.listen(process.env.PORT || 3000);
