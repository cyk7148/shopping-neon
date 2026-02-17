const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Render 連接 Neon 必須開啟 SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.static(path.join(__dirname, '../frontend')));

// 1. [積分功能] 查詢流水帳 API
app.get('/api/points-history', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM points_history WHERE user_email = $1 ORDER BY created_at DESC LIMIT 50', [req.query.email]);
    res.json(r.rows);
  } catch (e) { res.status(500).send(); }
});

// 2. [馬王公告] 只撈取具備認證標記的人
app.get('/api/winners', async (req, res) => {
  try {
    const r = await pool.query('SELECT username, bio FROM users WHERE has_won_jackpot = TRUE ORDER BY id DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).send(); }
});

// 3. 用戶同步與登入 (含強制標記判斷)
app.post('/api/get-user', async (req, res) => {
  try {
    const r = await pool.query('SELECT username, email, bio, points, is_profile_updated FROM users WHERE email = $1', [req.body.email]);
    if (r.rows.length > 0) res.json({ ...r.rows[0], points: Number(r.rows[0].points) });
    else res.status(404).send();
  } catch (e) { res.status(500).send(); }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (r.rows.length > 0 && await bcrypt.compare(password, r.rows[0].password)) {
      res.json({ ...r.rows[0], points: Number(r.rows[0].points) });
    } else if (r.rows.length === 0) {
      const hash = await bcrypt.hash(password, 10);
      const n = await pool.query('INSERT INTO users (email, password) VALUES ($1,$2) RETURNING *', [email, hash]);
      res.json({ ...n.rows[0], points: 0 });
    } else res.status(401).send();
  } catch (err) { res.status(500).send(); }
});

// 4. 修改資料 (解除強制鎖定)
app.post('/api/update-profile', async (req, res) => {
  const { email, username, bio, password } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET username=$1, bio=$2, password=$3, is_profile_updated=TRUE WHERE email=$4', [username, bio, hash, email]);
    } else await pool.query('UPDATE users SET username=$1, bio=$2, is_profile_updated=TRUE WHERE email=$3', [username, bio, email]);
    res.json({ message: "OK" });
  } catch (e) { res.status(500).send(); }
});

// 5. [簽到邏輯] 自動寫入流水帳
app.post('/api/daily-signin', async (req, res) => {
  try {
    const result = await pool.query(`UPDATE users SET points = points + 10, last_signin_date = CURRENT_DATE WHERE email = $1 AND (last_signin_date IS NULL OR last_signin_date < CURRENT_DATE)`, [req.body.email]);
    if (result.rowCount > 0) {
      await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, 10, $2)', [req.body.email, '🐎 馬年每日簽到獎勵']);
      const up = await pool.query('SELECT points FROM users WHERE email = $1', [req.body.email]);
      res.json({ message: "OK", points: Number(up.rows[0].points) });
    } else res.status(400).json({ error: "紅包今天領過囉" });
  } catch (err) { res.status(500).send(); }
});

// 6. [刮刮樂邏輯] 消耗與獲取均紀錄流水帳
app.post('/api/scratch-win', async (req, res) => {
  try {
    const u = await pool.query('SELECT points FROM users WHERE email = $1', [req.body.email]);
    if (Number(u.rows[0].points) < 1) return res.status(400).json({ error: "積分不足" });
    
    const prizes = (await pool.query('SELECT * FROM scratch_prizes')).rows;
    const totalW = prizes.reduce((s, p) => s + p.weight, 0);
    let r = Math.floor(Math.random() * totalW), sel = prizes[0];
    for (const p of prizes) { if (r < p.weight) { sel = p; break; } r -= p.weight; }
    
    // 紀錄 A：消耗 1 分
    await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, -1, $2)', [req.body.email, '🧧 參與馬年開運刮刮樂']);
    
    if (sel.points_reward > 0) {
      // 紀錄 B：中獎紀錄與馬王認證
      await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)', [req.body.email, sel.points_reward, `🧧 刮中：${sel.name}`]);
      if (sel.points_reward === 880000) await pool.query('UPDATE users SET has_won_jackpot = TRUE WHERE email = $1', [req.body.email]);
    }
    
    await pool.query('UPDATE users SET points = points - 1 + $1 WHERE email = $2', [sel.points_reward, req.body.email]);
    const up = await pool.query('SELECT points FROM users WHERE email = $1', [req.body.email]);
    res.json({ prizeName: sel.name, newTotal: Number(up.rows[0].points) });
  } catch (err) { res.status(500).send(); }
});

// 7. [結帳邏輯] 1% 回饋紀錄
app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  try {
    const reward = Math.floor(Number(total) * 0.01);
    await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, Math.floor(Number(total)), image_url]);
    if (reward > 0) {
      await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)', [email, reward, '🐎 馬年購物 1% 金幣回饋']);
      await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [reward, email]);
    }
    res.json({ message: "OK", reward: reward });
  } catch (e) { res.status(500).send(); }
});

app.get('/api/products', async (req, res) => { res.json((await pool.query('SELECT * FROM products ORDER BY id ASC')).rows); });
app.get('/api/orders', async (req, res) => { res.json((await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email])).rows); });

app.listen(process.env.PORT || 3000, () => console.log('Final Horse Server Ready'));
