const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// 連接 Neon 資料庫 (開啟 SSL 確保安全)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.static(path.join(__dirname, '../frontend')));

// 1. [新增] 查詢積分流水帳 API
app.get('/api/points-history', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM points_history WHERE user_email = $1 ORDER BY created_at DESC LIMIT 50', [req.query.email]);
    res.json(r.rows);
  } catch (e) { res.status(500).send(); }
});

// 2. 獲取馬王公告得主
app.get('/api/winners', async (req, res) => {
  try {
    const r = await pool.query('SELECT username, bio FROM users WHERE has_won_jackpot = TRUE ORDER BY id DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).send(); }
});

// 3. 用戶同步與登入 (維持原始邏輯)
app.post('/api/get-user', async (req, res) => {
  try {
    const r = await pool.query('SELECT username, email, bio, points, is_profile_updated, has_won_jackpot FROM users WHERE email = $1', [req.body.email]);
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

// 4. [簽到功能] 增加紀錄邏輯
app.post('/api/daily-signin', async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query(`UPDATE users SET points = points + 10, last_signin_date = CURRENT_DATE WHERE email = $1 AND (last_signin_date IS NULL OR last_signin_date < CURRENT_DATE)`, [email]);
    if (result.rowCount > 0) {
      // 寫入流水帳
      await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, 10, $2)', [email, '🐎 馬年開運簽到獎勵']);
      const up = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
      res.json({ message: "OK", points: Number(up.rows[0].points) });
    } else res.status(400).json({ error: "今天領過囉" });
  } catch (err) { res.status(500).send(); }
});

// 5. [刮刮樂功能] 消耗與獲獎均寫入紀錄
app.post('/api/scratch-win', async (req, res) => {
  const { email } = req.body;
  try {
    const u = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    if (Number(u.rows[0].points) < 1) return res.status(400).json({ error: "積分不足" });
    
    const prizes = (await pool.query('SELECT * FROM scratch_prizes')).rows;
    const totalW = prizes.reduce((s, p) => s + p.weight, 0);
    let r = Math.floor(Math.random() * totalW), sel = prizes[0];
    for (const p of prizes) { if (r < p.weight) { sel = p; break; } r -= p.weight; }
    
    // 紀錄：消耗 1 分
    await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, -1, $2)', [email, '🧧 參與開運刮刮樂消耗']);
    
    if (sel.points_reward > 0) {
      // 紀錄：刮中獎項
      await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)', [email, sel.points_reward, `🧧 刮中獎項：${sel.name}`]);
      if (sel.points_reward === 880000) await pool.query('UPDATE users SET has_won_jackpot = TRUE WHERE email = $1', [email]);
    }
    
    await pool.query('UPDATE users SET points = points - 1 + $1 WHERE email = $2', [sel.points_reward, email]);
    const up = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    res.json({ prizeName: sel.name, newTotal: Number(up.rows[0].points) });
  } catch (err) { res.status(500).send(); }
});

// 6. [結帳功能] 1% 回饋增加紀錄邏輯
app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  try {
    const reward = Math.floor(Number(total) * 0.01);
    await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, Math.floor(Number(total)), image_url]);
    
    if (reward > 0) {
      // 寫入回饋流水帳
      await pool.query('INSERT INTO points_history (user_email, change_amount, reason) VALUES ($1, $2, $3)', [email, reward, '🐎 馬年結帳 1% 回饋']);
      await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [reward, email]);
    }
    res.json({ message: "OK", reward: reward });
  } catch (e) { res.status(500).send(); }
});

// 7. 其他基礎營運 API (維持不動)
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

app.get('/api/products', async (req, res) => { res.json((await pool.query('SELECT * FROM products ORDER BY id ASC')).rows); });
app.get('/api/orders', async (req, res) => { res.json((await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email])).rows); });

app.listen(process.env.PORT || 3000, () => console.log('Horse Year Backend Ready'));
