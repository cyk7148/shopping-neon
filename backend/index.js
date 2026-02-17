const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(express.json());
app.use(cors());

// [始版 DNA] 指定靜態檔案目錄，確保瀏覽器找得到 index.html
app.use(express.static(path.join(__dirname, '../frontend')));

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
});

// 全服保底 100 抽機制
app.post('/api/scratch-win', async (req, res) => {
    const { email } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const gRes = await client.query('UPDATE global_settings SET value = value + 1 WHERE key = $1 RETURNING value', ['total_scratches']);
        const count = gRes.rows[0].value;
        const uRes = await client.query('SELECT points, winner_no FROM users WHERE email = $1', [email]);
        if (!uRes.rows[0] || Number(uRes.rows[0].points) < 10) throw new Error("POINTS_INSUFFICIENT");

        let sel;
        if (count % 100 === 0) {
            sel = (await client.query('SELECT * FROM scratch_prizes WHERE points_reward >= 880000 LIMIT 1')).rows[0];
        } else {
            const prizes = (await client.query('SELECT * FROM scratch_prizes')).rows;
            const totalW = prizes.reduce((s, p) => s + p.weight, 0);
            let r = Math.floor(Math.random() * totalW);
            sel = prizes[0];
            for (const p of prizes) { if (r < p.weight) { sel = p; break; } r -= p.weight; }
        }

        let winNo = uRes.rows[0].winner_no;
        if (sel.points_reward >= 880000 && !winNo) {
            const maxRes = await client.query('SELECT MAX(winner_no) as max_no FROM users');
            winNo = (parseInt(maxRes.rows[0].max_no) || 0) + 1;
            await client.query('UPDATE users SET has_won_jackpot = TRUE, winner_no = $1 WHERE email = $2', [winNo, email]);
        }
        await client.query('UPDATE users SET points = points - 10 + $1 WHERE email = $2', [sel.points_reward, email]);
        await client.query('COMMIT');
        res.json({ prizeName: sel.name, winnerNo: winNo, globalCount: count });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(400).send(e.message);
    } finally { client.release(); }
});

// API：公告欄、商品、統計
app.get('/api/winners', async (req, res) => {
    const r = await pool.query('SELECT username, bio, winner_no FROM users WHERE has_won_jackpot = TRUE ORDER BY winner_no ASC');
    res.json(r.rows);
});

app.get('/api/products', async (req, res) => {
    const r = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(r.rows);
});

app.get('/api/global-stats', async (req, res) => {
    const r = await pool.query('SELECT value FROM global_settings WHERE key = $1', ['total_scratches']);
    res.json({ total: r.rows[0] ? r.rows[0].value : 0 });
});

// [解決 Cannot GET /] 指向前端 index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(process.env.PORT || 3000);
