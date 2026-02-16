const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// 修正：加入 SSL 設定，否則 Render 無法同步 Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.static(path.join(__dirname, '../frontend')));

// 1. 同步資料 API (解決 0 分跳回問題)
app.post('/api/get-user', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
    if (result.rows.length > 0) {
        const u = result.rows[0];
        res.json({ username: u.username, email: u.email, bio: u.bio, points: Number(u.points) });
    } else res.status(404).json({ error: "找不到用戶" });
  } catch (err) { res.status(500).json({ error: "資料庫同步失敗" }); }
});

// 2. 每日簽到 (SQL 級別判定)
app.post('/api/daily-signin', async (req, res) => {
  try {
    const result = await pool.query(
        `UPDATE users SET points = points + 10, last_signin_date = CURRENT_DATE 
         WHERE email = $1 AND (last_signin_date IS NULL OR last_signin_date < CURRENT_DATE)`, [req.body.email]
    );
    if (result.rowCount > 0) {
        const updated = await pool.query('SELECT points FROM users WHERE email = $1', [req.body.email]);
        res.json({ message: "OK", points: Number(updated.rows[0].points) });
    } else res.status(400).json({ error: "今天已經簽到過了" });
  } catch (err) { res.status(500).json({ error: "系統錯誤" }); }
});

// 3. 刮刮樂 (1 點開刮)
app.post('/api/scratch-win', async (req, res) => {
  try {
    const userCheck = await pool.query('SELECT points FROM users WHERE email = $1', [req.body.email]);
    if (Number(userCheck.rows[0].points) < 1) return res.status(400).json({ error: "積分不足" });

    const prizes = (await pool.query('SELECT * FROM scratch_prizes')).rows;
    const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.floor(Math.random() * totalWeight), selected = prizes[0];
    for (const p of prizes) { if (random < p.weight) { selected = p; break; } random -= p.weight; }

    await pool.query('UPDATE users SET points = points - 1 + $1 WHERE email = $2', [selected.points_reward, req.body.email]);
    const updated = await pool.query('SELECT points FROM users WHERE email = $1', [req.body.email]);
    res.json({ prizeName: selected.name, newTotal: Number(updated.rows[0].points) });
  } catch (err) { res.status(500).send(); }
});

// 4. 登入、商品、訂單
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (user.rows.length > 0 && await bcrypt.compare(password, user.rows[0].password)) {
    const u = user.rows[0];
    res.json({ username: u.username, email: u.email, bio: u.bio, points: Number(u.points) });
  } else if (user.rows.length === 0) {
    const hash = await bcrypt.hash(password, 10);
    const newUser = await pool.query('INSERT INTO users (username, email, password, points) VALUES ($1,$2,$3,0) RETURNING *', ["新用戶", email, hash]);
    res.json({ username: newUser.rows[0].username, email: newUser.rows[0].email, bio: '網頁創作者', points: 0 });
  } else res.status(401).send();
});

app.get('/api/products', async (req, res) => { res.json((await pool.query('SELECT * FROM products ORDER BY id ASC')).rows); });
app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, Number(total), image_url]);
  await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [Math.floor(total * 0.01), email]);
  res.json({ message: "OK" });
});
app.get('/api/orders', async (req, res) => { res.json((await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email])).rows); });

app.listen(process.env.PORT || 3000, () => console.log('Server Ready'));
