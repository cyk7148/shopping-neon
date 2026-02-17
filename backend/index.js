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

// 1. [新增] 查詢積分流水帳 API
app.get('/api/points-history', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT reason, change_amount, created_at FROM points_history WHERE user_email = $1 ORDER BY created_at DESC LIMIT 50',
            [req.query.email]
        );
        res.json(result.rows);
    } catch (e) {
        res.status(500).send("資料庫讀取失敗");
    }
});

// 2. 獲取馬王得主公告
app.get('/api/winners', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT username, bio FROM users WHERE has_won_jackpot = TRUE ORDER BY id DESC'
        );
        res.json(result.rows);
    } catch (e) {
        res.status(500).send("無法取得得主資訊");
    }
});

// 3. [核心修復] 霸氣刮刮樂：固定扣除 10 積分
app.post('/api/scratch-win', async (req, res) => {
    const { email } = req.body;
    try {
        // 先檢查點數是否足夠
        const userRes = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        const currentPoints = Number(userRes.rows[0].points);

        if (currentPoints < 10) {
            return res.status(400).json({ error: "霸氣不足！需要 10 積分才能開刮" });
        }

        // 隨機選取獎項
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

        // 如果中獎，寫入獲獎紀錄
        if (selectedPrize.points_reward > 0) {
            await pool.query(
                'INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)',
                [email, selectedPrize.points_reward, `🧧 刮中獎項：${selectedPrize.name}`]
            );
            // 馬王賞判斷 (88萬)
            if (selectedPrize.points_reward >= 880000) {
                await pool.query('UPDATE users SET has_won_jackpot = TRUE WHERE email = $1', [email]);
            }
        }

        // 更新使用者點數 (總點數 - 10 + 獎勵)
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
        res.status(500).send("抽獎過程發生錯誤");
    }
});

// 4. 用戶登入與自動註冊 (維持第一版邏輯)
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userRes.rows.length > 0) {
            const isMatch = await bcrypt.compare(password, userRes.rows[0].password);
            if (isMatch) {
                return res.json({ ...userRes.rows[0], points: Number(userRes.rows[0].points) });
            } else {
                return res.status(401).send("密碼錯誤");
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
        res.status(500).send("登入失敗");
    }
});

// 5. 每日簽到 (加入紀錄)
app.post('/api/daily-signin', async (req, res) => {
    try {
        const { email } = req.body;
        const result = await pool.query(
            `UPDATE users SET points = points + 10, last_signin_date = CURRENT_DATE 
             WHERE email = $1 AND (last_signin_date IS NULL OR last_signin_date < CURRENT_DATE)`,
            [email]
        );

        if (result.rowCount > 0) {
            await pool.query(
                'INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, 10, $2)',
                [email, '🐎 馬年每日簽到獎勵']
            );
            const up = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
            res.json({ message: "OK", points: Number(up.rows[0].points) });
        } else {
            res.status(400).json({ error: "今天已經領過囉" });
        }
    } catch (err) {
        res.status(500).send("簽到失敗");
    }
});

// 6. 結帳功能 (含回饋紀錄)
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
                [email, reward, '🐎 馬年購物結帳回饋']
            );
            await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [reward, email]);
        }
        res.json({ message: "OK", reward: reward });
    } catch (e) {
        res.status(500).send("結帳失敗");
    }
});

// 7. 更新個人資料 (解除初始化鎖定)
app.post('/api/update-profile', async (req, res) => {
    const { email, username, bio, password } = req.body;
    try {
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            await pool.query(
                'UPDATE users SET username=$1, bio=$2, password=$3, is_profile_updated=TRUE WHERE email=$4',
                [username, bio, hash, email]
            );
        } else {
            await pool.query(
                'UPDATE users SET username=$1, bio=$2, is_profile_updated=TRUE WHERE email=$3',
                [username, bio, email]
            );
        }
        res.json({ message: "OK" });
    } catch (e) {
        res.status(500).send("更新失敗");
    }
});

// 8. 基礎獲取 API
app.post('/api/get-user', async (req, res) => {
    try {
        const r = await pool.query('SELECT username, email, bio, points, is_profile_updated, has_won_jackpot FROM users WHERE email = $1', [req.body.email]);
        res.json({ ...r.rows[0], points: Number(r.rows[0].points) });
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

app.listen(process.env.PORT || 3000, () => console.log('🐎 馬年後端已就緒 扣點 10 點版'));
