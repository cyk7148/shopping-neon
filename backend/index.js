const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// 資料庫連線配置
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.static(path.join(__dirname, '../frontend')));

// 1. 每日簽到 API (+10 積分)
app.post('/api/daily-signin', async (req, res) => {
    try {
        const { email } = req.body;
        // 檢查今天是否已簽到
        const result = await pool.query(
            `UPDATE users SET points = points + 10, last_signin_date = CURRENT_DATE 
             WHERE email = $1 AND (last_signin_date IS NULL OR last_signin_date < CURRENT_DATE)`,
            [email]
        );
        if (result.rowCount > 0) {
            await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, 10, $2)', [email, '🐎 馬年每日簽到獎勵']);
            const up = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
            res.json({ message: "OK", newTotal: Number(up.rows[0].points) });
        } else {
            res.status(400).json({ error: "今天已經簽到過囉！" });
        }
    } catch (e) { res.status(500).send("簽到系統異常"); }
});

// 2. 霸氣刮刮樂 (固定扣 10 點)
app.post('/api/scratch-win', async (req, res) => {
    const { email } = req.body;
    try {
        const userRes = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        if (Number(userRes.rows[0].points) < 10) return res.status(400).json({ error: "積分不足 10 點" });

        // 權重隨機演算法
        const prizes = (await pool.query('SELECT * FROM scratch_prizes')).rows;
        const totalW = prizes.reduce((s, p) => s + p.weight, 0);
        let r = Math.floor(Math.random() * totalW), sel = prizes[0];
        for (const p of prizes) { if (r < p.weight) { sel = p; break; } r -= p.weight; }

        // 扣除開刮成本
        await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, -10, $2)', [email, '🧧 參與霸氣刮刮樂消耗']);
        
        // 發放獎項
        if (sel.points_reward > 0) {
            await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)', [email, sel.points_reward, `🧧 刮中獎項：${sel.name}`]);
            // 判定是否為 88 萬大獎，標記為馬王得主
            if (sel.points_reward >= 880000) await pool.query('UPDATE users SET has_won_jackpot = TRUE WHERE email = $1', [email]);
        }
        
        await pool.query('UPDATE users SET points = points - 10 + $1 WHERE email = $2', [sel.points_reward, email]);
        const updated = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        res.json({ prizeName: sel.name, newTotal: Number(updated.rows[0].points) });
    } catch (e) { res.status(500).send("開刮失敗"); }
});

// 3. 結帳功能 (含 1% 回饋)
app.post('/api/checkout', async (req, res) => {
    try {
        const { email, total, products, image_url } = req.body;
        const reward = Math.floor(Number(total) * 0.01);
        await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, total, image_url]);
        if (reward > 0) {
            await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)', [email, reward, '🐎 結帳 1% 回饋']);
            await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [reward, email]);
        }
        const up = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        res.json({ message: "OK", reward, newTotal: Number(up.rows[0].points) });
    } catch (e) { res.status(500).send("結帳失敗"); }
});

// 4. 公告欄得主名單 (由早排到晚：ASC)
app.get('/api/winners', async (req, res) => {
    try {
        // 修改：使用 ORDER BY id ASC，讓最早的中獎者在最上面
        const result = await pool.query('SELECT username, bio FROM users WHERE has_won_jackpot = TRUE ORDER BY id ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).send("公告載入錯誤"); }
});

// 5. 使用者管理與驗證
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (r.rows.length > 0 && await bcrypt.compare(password, r.rows[0].password)) {
        return res.json({ ...r.rows[0], points: Number(r.rows[0].points) });
    }
    if (r.rows.length === 0) {
        const hash = await bcrypt.hash(password, 10);
        const n = await pool.query('INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *', [email, hash]);
        return res.json({ ...n.rows[0], points: 0 });
    }
    res.status(401).send("帳號或密碼錯誤");
});

app.post('/api/get-user', async (req, res) => {
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
    if (r.rows.length > 0) res.json({ ...r.rows[0], points: Number(r.rows[0].points) });
    else res.status(404).send();
});

app.post('/api/update-profile', async (req, res) => {
    const { email, username, bio, password } = req.body;
    if (password) {
        const h = await bcrypt.hash(password, 10);
        await pool.query('UPDATE users SET username=$1, bio=$2, password=$3, is_profile_updated=TRUE WHERE email=$4', [username, bio, h, email]);
    } else {
        await pool.query('UPDATE users SET username=$1, bio=$2, is_profile_updated=TRUE WHERE email=$3', [username, bio, email]);
    }
    res.json({ message: "OK" });
});

// 6. 其他基礎數據讀取
app.get('/api/products', async (req, res) => res.json((await pool.query('SELECT * FROM products ORDER BY id ASC')).rows));
app.get('/api/orders', async (req, res) => res.json((await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email])).rows));
app.get('/api/points-history', async (req, res) => res.json((await pool.query('SELECT * FROM points_history WHERE user_email = $1 ORDER BY created_at DESC', [req.query.email])).rows));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`始版後端運行中：連接埠 ${PORT}`));
