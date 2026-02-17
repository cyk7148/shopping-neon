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

// 1. 霸氣刮刮樂：全服保底機制 (每 100 抽必中大獎)
app.post('/api/scratch-win', async (req, res) => {
    const { email } = req.body;
    const client = await pool.connect(); // 開啟連線以執行事務鎖定
    try {
        await client.query('BEGIN'); // 開始事務，防止多人競爭計數器

        // [步驟 A] 全域計數器 +1 並取得當前總次數
        const globalRes = await client.query(
            'UPDATE global_settings SET value = value + 1 WHERE key = $1 RETURNING value', 
            ['total_scratches']
        );
        const currentGlobalCount = globalRes.rows[0].value;

        // [步驟 B] 檢查使用者積分
        const userRes = await client.query('SELECT points, winner_no FROM users WHERE email = $1', [email]);
        if (Number(userRes.rows[0].points) < 10) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "積分不足 10 點" });
        }

        let sel;
        // [步驟 C] 保底判定：每逢 100 的倍數即為中獎者
        if (currentGlobalCount % 100 === 0) {
            const prizeRes = await client.query('SELECT * FROM scratch_prizes WHERE points_reward >= 880000 LIMIT 1');
            sel = prizeRes.rows[0];
        } else {
            // 一般隨機邏輯 (始版 DNA：權重演算法)
            const prizesRes = await client.query('SELECT * FROM scratch_prizes');
            const prizes = prizesRes.rows;
            const totalW = prizes.reduce((s, p) => s + p.weight, 0);
            let r = Math.floor(Math.random() * totalW), tempSel = prizes[0];
            for (const p of prizes) { if (r < p.weight) { tempSel = p; break; } r -= p.weight; }
            sel = tempSel;
        }

        // [步驟 D] 馬王序號鎖定 (一人一號、絕對物理排序)
        let currentWinnerNo = userRes.rows[0].winner_no;
        if (sel.points_reward >= 880000 && !currentWinnerNo) {
            const maxNoRes = await client.query('SELECT MAX(winner_no) as max_no FROM users');
            currentWinnerNo = (parseInt(maxNoRes.rows[0].max_no) || 0) + 1;
            await client.query('UPDATE users SET has_won_jackpot = TRUE, winner_no = $1 WHERE email = $2', [currentWinnerNo, email]);
        }

        // [步驟 E] 扣款、發獎與寫入流水帳
        await client.query('UPDATE users SET points = points - 10 + $1 WHERE email = $2', [sel.points_reward, email]);
        await client.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, -10, $2)', [email, `🧧 全服第 ${currentGlobalCount} 抽`]);
        if (sel.points_reward > 0) {
            await client.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)', [email, sel.points_reward, `🧧 刮中獎項：${sel.name}`]);
        }

        await client.query('COMMIT'); // 提交所有更動

        const updated = await client.query('SELECT points FROM users WHERE email = $1', [email]);
        res.json({ 
            prizeName: sel.name, 
            newTotal: Number(updated.rows[0].points),
            winnerNo: currentWinnerNo,
            globalCount: currentGlobalCount 
        });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("刮刮樂異常:", e);
        res.status(500).send("系統忙碌中");
    } finally {
        client.release();
    }
});

// 2. 公告欄：由早排到晚 (依 winner_no ASC)
app.get('/api/winners', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT username, bio, winner_no FROM users WHERE has_won_jackpot = TRUE ORDER BY winner_no ASC'
        );
        res.json(result.rows);
    } catch (e) { res.status(500).send("Error"); }
});

// 3. 獲取當前全服總抽獎次數 (供前端顯示)
app.get('/api/global-stats', async (req, res) => {
    try {
        const r = await pool.query('SELECT value FROM global_settings WHERE key = $1', ['total_scratches']);
        res.json({ total: r.rows[0].value });
    } catch (e) { res.status(500).send("Error"); }
});

// 4. 使用者管理與驗證
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
    res.status(401).send("帳密錯誤");
});

// --- 其他基礎 API (每日簽到、結帳回饋) 維持原本始版功能 ---
app.post('/api/daily-signin', async (req, res) => {
    const { email } = req.body;
    const result = await pool.query(`UPDATE users SET points = points + 10, last_signin_date = CURRENT_DATE WHERE email = $1 AND (last_signin_date IS NULL OR last_signin_date < CURRENT_DATE)`, [email]);
    if (result.rowCount > 0) {
        await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, 10, $2)', [email, '🐎 每日簽到']);
        const up = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        res.json({ message: "OK", newTotal: Number(up.rows[0].points) });
    } else res.status(400).send();
});

app.post('/api/checkout', async (req, res) => {
    const { email, total, products, image_url } = req.body;
    const reward = Math.floor(Number(total) * 0.01);
    await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, total, image_url]);
    if (reward > 0) {
        await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [reward, email]);
        await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)', [email, reward, '🐎 結帳 1% 回饋']);
    }
    const up = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    res.json({ message: "OK", newTotal: Number(up.rows[0].points) });
});

app.get('/api/products', async (req, res) => res.json((await pool.query('SELECT * FROM products ORDER BY id ASC')).rows));
app.get('/api/points-history', async (req, res) => res.json((await pool.query('SELECT * FROM points_history WHERE user_email = $1 ORDER BY created_at DESC', [req.query.email])).rows));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`始版全服保底後端運行中`));
