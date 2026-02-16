const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// ⚠️ 這是最關鍵的一步：Render 必須開啟 SSL 才能同步 Neon 資料庫
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } 
});

app.use(express.static(path.join(__dirname, '../frontend')));

// 同步資料 API：解決積分跳回 0 的問題
app.post('/api/get-user', async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query('SELECT username, email, bio, points FROM users WHERE email = $1', [email]);
    if (result.rows.length > 0) {
        const u = result.rows[0];
        res.json({ 
            username: u.username, 
            email: u.email, 
            bio: u.bio || '網頁創作者', 
            points: Number(u.points || 0) 
        });
    } else res.status(404).json({ error: "用戶不存在" });
  } catch (err) { res.status(500).json({ error: "資料庫讀取失敗" }); }
});

// 簽到與刮刮樂 API (邏輯必須嚴謹)
app.post('/api/daily-signin', async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query(
        `UPDATE users SET points = points + 10, last_signin_date = CURRENT_DATE 
         WHERE email = $1 AND (last_signin_date IS NULL OR last_signin_date < CURRENT_DATE)`, [email]
    );
    if (result.rowCount > 0) {
        const updated = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        res.json({ message: "OK", points: Number(updated.rows[0].points) });
    } else res.status(400).json({ error: "今天已經簽到過了" });
  } catch (err) { res.status(500).json({ error: "系統錯誤" }); }
});

// 刮刮樂邏輯 (1 點開刮)
app.post('/api/scratch-win', async (req, res) => {
  const { email } = req.body;
  try {
    const u = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    if (Number(u.rows[0].points) < 1) return res.status(400).json({ error: "積分不足" });
    const prizes = (await pool.query('SELECT * FROM scratch_prizes')).rows;
    const totalW = prizes.reduce((s, p) => s + p.weight, 0);
    let r = Math.floor(Math.random() * totalW), sel = prizes[0];
    for (const p of prizes) { if (r < p.weight) { sel = p; break; } r -= p.weight; }
    await pool.query('UPDATE users SET points = points - 1 + $1 WHERE email = $2', [sel.points_reward, email]);
    const up = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    res.json({ prizeName: sel.name, newTotal: Number(up.rows[0].points) });
  } catch (err) { res.status(500).json({ error: "系統錯誤" }); }
});

// 其他 API (Login, Products, Checkout...) 省略，請確保與先前一致
// 記得補上 app.listen...
app.listen(process.env.PORT || 3000, () => console.log('Server Ready'));
