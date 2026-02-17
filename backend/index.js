const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.static(path.join(__dirname, '../frontend')));

// [修復：每日簽到 API]
app.post('/api/daily-signin', async (req, res) => {
    try {
        const { email } = req.body;
        // 檢查今天是否已簽到 (利用資料庫 CURRENT_DATE 判斷)
        const result = await pool.query(
            `UPDATE users SET points = points + 10, last_signin_date = CURRENT_DATE 
             WHERE email = $1 AND (last_signin_date IS NULL OR last_signin_date < CURRENT_DATE)`,
            [email]
        );

        if (result.rowCount > 0) {
            // 寫入流水帳紀錄
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
        res.status(500).send("簽到系統故障");
    }
});

// [始版：霸氣刮刮樂 10 點]
app.post('/api/scratch-win', async (req, res) => {
    const { email } = req.body;
    try {
        const userRes = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        if (Number(userRes.rows[0].points) < 10) return res.status(400).json({ error: "積分不足" });
        const prizes = (await pool.query('SELECT * FROM scratch_prizes')).rows;
        const totalW = prizes.reduce((s, p) => s + p.weight, 0);
        let r = Math.floor(Math.random() * totalW), sel = prizes[0];
        for (const p of prizes) { if (r < p.weight) { sel = p; break; } r -= p.weight; }
        await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, -10, $2)', [email, '🧧 參與霸氣刮刮樂消耗']);
        if (sel.points_reward > 0) {
            await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)', [email, sel.points_reward, `🧧 刮中項：${sel.name}`]);
            if (sel.points_reward >= 880000) await pool.query('UPDATE users SET has_won_jackpot = TRUE WHERE email = $1', [email]);
        }
        await pool.query('UPDATE users SET points = points - 10 + $1 WHERE email = $2', [sel.points_reward, email]);
        const updated = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        res.json({ prizeName: sel.name, newTotal: Number(updated.rows[0].points) });
    } catch (e) { res.status(500).send(); }
});

// [始版：其餘邏輯 100% 維持]
app.get('/api/points-history', async (req, res) => {
    const r = await pool.query('SELECT * FROM points_history WHERE user_email = $1 ORDER BY created_at DESC', [req.query.email]);
    res.json(r.rows);
});
app.post('/api/checkout', async (req, res) => {
    const { email, total, products, image_url } = req.body;
    const reward = Math.floor(Number(total) * 0.01);
    await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, total, image_url]);
    if (reward > 0) {
        await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)', [email, reward, '🐎 結帳 1% 回饋']);
        await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [reward, email]);
    }
    const up = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    res.json({ message: "OK", reward, newTotal: Number(up.rows[0].points) });
});
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (r.rows.length > 0 && await bcrypt.compare(password, r.rows[0].password)) return res.json({ ...r.rows[0], points: Number(r.rows[0].points) });
    if (r.rows.length === 0) {
        const hash = await bcrypt.hash(password, 10);
        const n = await pool.query('INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *', [email, hash]);
        return res.json({ ...n.rows[0], points: 0 });
    }
    res.status(401).send();
});
app.post('/api/get-user', async (req, res) => {
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
    res.json({ ...r.rows[0], points: Number(r.rows[0].points) });
});
app.post('/api/update-profile', async (req, res) => {
    const { email, username, bio, password } = req.body;
    if (password) {
        const h = await bcrypt.hash(password, 10);
        await pool.query('UPDATE users SET username=$1, bio=$2, password=$3, is_profile_updated=TRUE WHERE email=$4', [username, bio, h, email]);
    } else await pool.query('UPDATE users SET username=$1, bio=$2, is_profile_updated=TRUE WHERE email=$3', [username, bio, email]);
    res.json({ message: "OK" });
});
app.get('/api/products', async (req, res) => res.json((await pool.query('SELECT * FROM products ORDER BY id ASC')).rows));
app.get('/api/orders', async (req, res) => res.json((await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email])).rows));
app.get('/api/winners', async (req, res) => res.json((await pool.query('SELECT username, bio FROM users WHERE has_won_jackpot = TRUE ORDER BY id DESC')).rows));

app.listen(process.env.PORT || 3000);
