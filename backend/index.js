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

// 取得商品列表
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 結帳 + 1% 積分回饋
app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  const reward = Math.floor(parseInt(total) * 0.01); // 1% 算法
  try {
    await pool.query('BEGIN');
    await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, parseInt(total), image_url]);
    await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [reward, email]);
    await pool.query('COMMIT');
    res.json({ message: "OK", reward });
  } catch (err) { await pool.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
});

// 新年刮刮樂預測結算
app.post('/api/scratch-win', async (req, res) => {
  const { email } = req.body;
  const cost = 10;
  try {
    const user = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    if (user.rows[0].points < cost) return res.status(400).json({ error: "積分不足" });
    const prizes = await pool.query('SELECT * FROM scratch_prizes');
    const totalWeight = prizes.rows.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.floor(Math.random() * totalWeight);
    let selected = prizes.rows[0];
    for (const p of prizes.rows) { if (random < p.weight) { selected = p; break; } random -= p.weight; }
    await pool.query('UPDATE users SET points = points - $1 + $2 WHERE email = $3', [cost, selected.points_reward, email]);
    res.json({ prizeName: selected.name, reward: selected.points_reward, newTotal: user.rows[0].points - cost + selected.points_reward });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 簽到 API
app.post('/api/daily-signin', async (req, res) => {
  try {
    await pool.query('UPDATE users SET points = points + 10 WHERE email = $1', [req.body.email]);
    res.json({ message: "OK" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 登入 API
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0 && await bcrypt.compare(password, user.rows[0].password)) {
      res.json({ username: user.rows[0].username, email: user.rows[0].email, bio: user.rows[0].bio, points: user.rows[0].points });
    } else res.status(401).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/orders', async (req, res) => {
  const result = await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email]);
  res.json(result.rows);
});

app.post('/api/update-profile', async (req, res) => {
  if (req.body.username) await pool.query('UPDATE users SET username = $1 WHERE email = $2', [req.body.username, req.body.email]);
  if (req.body.bio) await pool.query('UPDATE users SET bio = $1 WHERE email = $2', [req.body.bio, req.body.email]);
  res.json({ message: "OK" });
});

app.listen(process.env.PORT || 3000, () => console.log('萌伺服器啟動'));
