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

// 1. [營運升級] 公告欄 API：只顯示擁有認證標記的蛇王
app.get('/api/winners', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT username, bio FROM users WHERE has_won_jackpot = TRUE ORDER BY id DESC'
    );
    res.json(result.rows);
  } catch (err) { res.status(500).send(); }
});

// 2. 同步資料與登入
app.post('/api/get-user', async (req, res) => {
  try {
    const r = await pool.query('SELECT username, email, bio, points, is_profile_updated FROM users WHERE email = $1', [req.body.email]);
    if (r.rows.length > 0) res.json({ ...r.rows[0], points: Number(r.rows[0].points) });
    else res.status(404).send();
  } catch (err) { res.status(500).send(); }
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

// 3. 修改個人資料 (成功後解除強制修改鎖定)
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
  } catch (err) { res.status(500).send(); }
});

// 4. [邏輯強化] 刮刮樂：中 88 萬時寫入防偽標記
app.post('/api/scratch-win', async (req, res) => {
  try {
    const u = await pool.query('SELECT points FROM users WHERE email = $1', [req.body.email]);
    if (Number(u.rows[0].points) < 1) return res.status(400).json({ error: "積分不足" });
    
    const prizes = (await pool.query('SELECT * FROM scratch_prizes')).rows;
    const totalW = prizes.reduce((s, p) => s + p.weight, 0);
    let r = Math.floor(Math.random() * totalW), sel = prizes[0];
    for (const p of prizes) { if (r < p.weight) { sel = p; break; } r -= p.weight; }
    
    // 如果中大獎，更新 has_won_jackpot
    if (sel.points_reward === 880000) {
      await pool.query('UPDATE users SET has_won_jackpot = TRUE WHERE email = $1', [req.body.email]);
    }
    
    await pool.query('UPDATE users SET points = points - 1 + $1 WHERE email = $2', [sel.points_reward, req.body.email]);
    const up = await pool.query('SELECT points FROM users WHERE email = $1', [req.body.email]);
    res.json({ prizeName: sel.name, newTotal: Number(up.rows[0].points) });
  } catch (err) { res.status(500).send(); }
});

// 5. 其他功能 (簽到、商品、結帳)
app.post('/api/daily-signin', async (req, res) => {
  try {
    const result = await pool.query(`UPDATE users SET points = points + 10, last_signin_date = CURRENT_DATE WHERE email = $1 AND (last_signin_date IS NULL OR last_signin_date < CURRENT_DATE)`, [req.body.email]);
    if (result.rowCount > 0) {
      const up = await pool.query('SELECT points FROM users WHERE email = $1', [req.body.email]);
      res.json({ message: "OK", points: Number(up.rows[0].points) });
    } else res.status(400).json({ error: "今天已經簽到過了" });
  } catch (err) { res.status(500).send(); }
});

app.get('/api/products', async (req, res) => { res.json((await pool.query('SELECT * FROM products ORDER BY id ASC')).rows); });

app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  try {
    await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, Math.floor(Number(total)), image_url]);
    const reward = Math.floor(Number(total) * 0.01);
    await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [reward, email]);
    res.json({ message: "OK", reward: reward });
  } catch (err) { res.status(500).json({ error: "結帳失敗" }); }
});

app.get('/api/orders', async (req, res) => { res.json((await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email])).rows); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server Ready on port ' + PORT));
