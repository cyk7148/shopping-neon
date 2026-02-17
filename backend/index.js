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

// 1. 查詢積分流水帳 API
app.get('/api/points-history', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM points_history WHERE user_email = $1 ORDER BY created_at DESC LIMIT 50',
            [req.query.email]
        );
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).send("Server Error");
    }
});

// 2. 獲取馬王公告得主
app.get('/api/winners', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT username, bio FROM users WHERE has_won_jackpot = TRUE ORDER BY id DESC'
        );
        res.json(result.rows);
    } catch (e) {
        res.status(500).send("Server Error");
    }
});

// 3. 霸氣刮刮樂：一次扣 10 點邏輯
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

        // 寫入扣點紀錄 (10點)
        await pool.query(
            'INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, -10, $2)',
            [email, '🧧 參與霸氣刮刮樂消耗']
        );

        if (selectedPrize.points_reward > 0) {
            // 寫入中獎紀錄
            await pool.query(
                'INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)',
                [email, selectedPrize.points_reward, `🧧 刮中：${selectedPrize.name}`]
            );
            // 檢查是否刮中馬王賞 (88萬)
            if (selectedPrize.points_reward === 880000) {
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
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// 4. 用戶登入與自動註冊
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userRes.rows.length > 0) {
            const isMatch = await bcrypt.compare(password, userRes.rows[0].password);
            if (isMatch) {
                return res.json({ ...userRes.rows[0], points: Number(userRes.rows[0].points) });
            } else {
                return res.status(401).send("Password incorrect");
            }
        } else {
            const hash = await bcrypt.hash(password, 10);
            const newUser = await pool.query(
                'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *',
                [email, hash]
            );
            res.json({ ...newUser.rows[0], points: 0 });
        }
    } catch (e) {
        res.status(500).send("Server Error");
    }
});

// 5. 結帳功能 (含回饋)
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
    } catch (e) {
        res.status(500).send("Server Error");
    }
});

// 6. 其他基礎營運 API
app.post('/api/get-user', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
        res.json({ ...r.rows[0], points: Number(r.rows[0].points) });
    } catch (e) { res.status(500).send(); }
});

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

app.get('/api/products', async (req, res) => {
    const r = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(r.rows);
});

app.get('/api/orders', async (req, res) => {
    const r = await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email]);
    res.json(r.rows);
});

app.listen(process.env.PORT || 3000, () => console.log('horse year ready'));
