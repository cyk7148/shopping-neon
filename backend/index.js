const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// ⚠️ 關鍵：Render 連接 Neon 必須開啟 SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.static(path.join(__dirname, '../frontend')));

// 1. 同步與登入 API
app.post('/api/get-user', async (req, res) => {
  try {
    const r = await pool.query('SELECT username, email, bio, points FROM users WHERE email = $1', [req.body.email]);
    if (r.rows.length > 0) {
      const u = r.rows[0];
      res.json({ username: u.username, email: u.email, bio: u.bio || '網頁創作者', points: Number(u.points || 0) });
    } else res.status(404).send();
  } catch (err) { res.status(500).send(); }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (r.rows.length > 0 && await bcrypt.compare(password, r.rows[0].password)) {
      const u = r.rows[0];
      res.json({ username: u.username, email: u.email, bio: u.bio || '網頁創作者', points: Number(u.points || 0) });
    } else if (r.rows.length === 0) {
      const hash = await bcrypt.hash(password, 10);
      const n = await pool.query('INSERT INTO users (username, email, password, points) VALUES ($1,$2,$3,0) RETURNING *', ["新用戶", email, hash]);
      res.json({ username: n.rows[0].username, email: n.rows[0].email, bio: '網頁創作者', points: 0 });
    } else res.status(401).send();
  } catch (err) { res.status(500).send(); }
});

// 2. 簽到與刮刮樂 (1 點開刮)
app.post('/api/daily-signin', async (req, res) => {
  try {
    const result = await pool.query(
        `UPDATE users SET points = COALESCE(points, 0) + 10, last_signin_date = CURRENT_DATE 
         WHERE email = $1 AND (last_signin_date IS NULL OR last_signin_date < CURRENT_DATE)`, [req.body.email]
    );
    if (result.rowCount > 0) {
        const up = await pool.query('SELECT points FROM users WHERE email = $1', [req.body.email]);
        res.json({ message: "OK", points: Number(up.rows[0].points) });
    } else res.status(400).json({ error: "今天已經簽到過了" });
  } catch (err) { res.status(500).send(); }
});

app.post('/api/scratch-win', async (req, res) => {
  try {
    const u = await pool.query('SELECT points FROM users WHERE email = $1', [req.body.email]);
    if (Number(u.rows[0].points) < 1) return res.status(400).json({ error: "積分不足" });
    const prizes = (await pool.query('SELECT * FROM scratch_prizes')).rows;
    const totalW = prizes.reduce((s, p) => s + p.weight, 0);
    let r = Math.floor(Math.random() * totalW), sel = prizes[0];
    for (const p of prizes) { if (r < p.weight) { sel = p; break; } r -= p.weight; }
    await pool.query('UPDATE users SET points = points - 1 + $1 WHERE email = $2', [sel.points_reward, req.body.email]);
    const up = await pool.query('SELECT points FROM users WHERE email = $1', [req.body.email]);
    res.json({ prizeName: sel.name, newTotal: Number(up.rows[0].points) });
  } catch (err) { res.status(500).send(); }
});

// 3. 產品、結帳與資料更新
app.get('/api/products', async (req, res) => { res.json((await pool.query('SELECT * FROM products ORDER BY id ASC')).rows); });
app.post('/api/update-profile', async (req, res) => {
    const { email, username, bio, password } = req.body;
    if (password) {
        const hash = await bcrypt.hash(password, 10);
        await pool.query('UPDATE users SET username=$1, bio=$2, password=$3 WHERE email=$4', [username, bio, hash, email]);
    } else await pool.query('UPDATE users SET username=$1, bio=$2 WHERE email=$3', [username, bio, email]);
    res.json({ message: "OK" });
});

app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, Number(total), image_url]);
  await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [Math.floor(total * 0.01), email]);
  res.json({ message: "OK" });
});
app.get('/api/orders', async (req, res) => { res.json((await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email])).rows); });

app.listen(process.env.PORT || 3000, () => console.log('Server Ready'));
