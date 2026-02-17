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

// 1. 積分流水帳查詢 API
app.get('/api/points-history', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT reason, change_amount, created_at FROM points_history WHERE user_email = $1 ORDER BY created_at DESC LIMIT 50',
            [req.query.email]
        );
        res.json(result.rows);
    } catch (e) {
        res.status(500).send("Server Error");
    }
});

// 2. 霸氣刮刮樂：固定扣除 10 積分
app.post('/api/scratch-win', async (req, res) => {
    const { email } = req.body;
    try {
        const userRes = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        const currentPoints = Number(userRes.rows[0].points);

        if (currentPoints < 10) {
            return res.status(400).json({ error: "霸氣不足！需要 10 積分才能開刮" });
        }

        const prizesRes = await pool.query('SELECT * FROM scratch_prizes');
        const prizes = prizesRes.rows;
        const totalWeight = prizes.reduce((s, p) => s + p.weight, 0);
        let randomNum = Math.floor(Math.random() * totalWeight);
        let selectedPrize = prizes[0];

        for (const p of prizes) {
            if (randomNum < p.weight) {
                selectedPrize = p;
                break;
            }
            randomNum -= p.weight;
        }

        // 紀錄：消耗 10 分
        await pool.query(
            'INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, -10, $2)',
            [email, '🧧 參與霸氣刮刮樂消耗']
        );
        
        if (selectedPrize.points_reward > 0) {
            await pool.query(
                'INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)',
                [email, selectedPrize.points_reward, `🧧 刮中獎項：${selectedPrize.name}`]
            );
            if (selectedPrize.points_reward >= 880000) {
                await pool.query('UPDATE users SET has_won_jackpot = TRUE WHERE email = $1', [email]);
            }
        }

        await pool.query(
            'UPDATE users SET points = points - 10 + $1 WHERE email = $2',
            [selectedPrize.points_reward, email]
        );

        const updatedUser = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        res.json({
            prizeName: selectedPrize.name,
            newTotal: Number(updatedUser.rows[0].points)
        });
    } catch (err) {
        res.status(500).send("抽獎錯誤");
    }
});

// 3. 結帳 (1% 回饋)
app.post('/api/checkout', async (req, res) => {
    const { email, total, products, image_url } = req.body;
    try {
        const reward = Math.floor(Number(total) * 0.01);
        await pool.query(
            'INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1, $2, $3, $4)',
            [email, products, Math.floor(Number(total)), image_url]
        );
        if (reward > 0) {
            await pool.query(
                'INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)',
                [email, reward, '🐎 結帳 1% 回饋']
            );
            await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [reward, email]);
        }
        res.json({ message: "OK", reward: reward });
    } catch (e) { res.status(500).send("結帳失敗"); }
});

// 4. 登入與註冊
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userRes.rows.length > 0) {
            const isMatch = await bcrypt.compare(password, userRes.rows[0].password);
            if (isMatch) return res.json({ ...userRes.rows[0], points: Number(userRes.rows[0].points) });
            return res.status(401).send();
        } else {
            const hash = await bcrypt.hash(password, 10);
            const newUser = await pool.query('INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *', [email, hash]);
            res.json({ ...newUser.rows[0], points: 0 });
        }
    } catch (e) { res.status(500).send(); }
});

// 5. 更新個人資料 (含強制初始化)
app.post('/api/update-profile', async (req, res) => {
    const { email, username, bio, password } = req.body;
    try {
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            await pool.query('UPDATE users SET username=$1, bio=$2, password=$3, is_profile_updated=TRUE WHERE email=$4', [username, bio, hash, email]);
        } else {
            await pool.query('UPDATE users SET username=$1, bio=$2, is_profile_updated=TRUE WHERE email=$3', [username, bio, email]);
        }
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send(); }
});

app.get('/api/winners', async (req, res) => {
    const r = await pool.query('SELECT username, bio FROM users WHERE has_won_jackpot = TRUE ORDER BY id DESC');
    res.json(r.rows);
});
app.post('/api/get-user', async (req, res) => {
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
    res.json({ ...r.rows[0], points: Number(r.rows[0].points) });
});
app.get('/api/products', async (req, res) => { res.json((await pool.query('SELECT * FROM products ORDER BY id ASC')).rows); });
app.get('/api/orders', async (req, res) => { res.json((await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email])).rows); });

app.listen(process.env.PORT || 3000);
