const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors()); // [重要] 允許前端跨域存取

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
});

// [全服保底] 每 100 抽必中大獎
app.post('/api/scratch-win', async (req, res) => {
    const { email } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. 全域計數 +1
        const gRes = await client.query('UPDATE global_settings SET value = value + 1 WHERE key = $1 RETURNING value', ['total_scratches']);
        const count = gRes.rows[0].value;

        // 2. 取得用戶資料
        const uRes = await client.query('SELECT points, winner_no FROM users WHERE email = $1', [email]);
        if (!uRes.rows[0] || Number(uRes.rows[0].points) < 10) throw new Error("POINTS_INSUFFICIENT");

        let sel;
        // 3. 保底判定
        if (count % 100 === 0) {
            sel = (await client.query('SELECT * FROM scratch_prizes WHERE points_reward >= 880000 LIMIT 1')).rows[0];
        } else {
            const prizes = (await client.query('SELECT * FROM scratch_prizes')).rows;
            const totalW = prizes.reduce((s, p) => s + p.weight, 0);
            let r = Math.floor(Math.random() * totalW);
            sel = prizes[0];
            for (const p of prizes) { if (r < p.weight) { sel = p; break; } r -= p.weight; }
        }

        // 4. 一人一號鎖定
        let winNo = uRes.rows[0].winner_no;
        if (sel.points_reward >= 880000 && !winNo) {
            const maxRes = await client.query('SELECT MAX(winner_no) as max_no FROM users');
            winNo = (parseInt(maxRes.rows[0].max_no) || 0) + 1;
            await client.query('UPDATE users SET has_won_jackpot = TRUE, winner_no = $1 WHERE email = $2', [winNo, email]);
        }

        // 5. 更新點數
        await client.query('UPDATE users SET points = points - 10 + $1 WHERE email = $2', [sel.points_reward, email]);
        await client.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, -10, $2)', [email, `全服第 ${count} 抽`]);
        
        await client.query('COMMIT');
        res.json({ prizeName: sel.name, newTotal: (Number(uRes.rows[0].points) - 10 + sel.points_reward), winnerNo: winNo, globalCount: count });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(400).send(e.message);
    } finally { client.release(); }
});

// 公告欄與全服數據 API
app.get('/api/winners', async (req, res) => {
    const r = await pool.query('SELECT username, bio, winner_no FROM users WHERE has_won_jackpot = TRUE ORDER BY winner_no ASC');
    res.json(r.rows);
});

app.get('/api/global-stats', async (req, res) => {
    const r = await pool.query('SELECT value FROM global_settings WHERE key = $1', ['total_scratches']);
    res.json({ total: r.rows[0] ? r.rows[0].value : 0 });
});

app.listen(process.env.PORT || 3000, () => console.log("始版後端運行中"));
