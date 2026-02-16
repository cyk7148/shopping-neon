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

// 每日簽到：SQL 級別判定
app.post('/api/daily-signin', async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query(
        `UPDATE users SET points = COALESCE(points, 0) + 10, last_signin_date = CURRENT_DATE 
         WHERE email = $1 AND (last_signin_date IS NULL OR last_signin_date < CURRENT_DATE)`, [email]
    );
    if (result.rowCount > 0) {
        const updated = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
        res.json({ message: "OK", points: Number(updated.rows[0].points) });
    } else res.status(400).json({ error: "今天已經簽到過囉！" });
  } catch (err) { res.status(500).json({ error: "系統異常" }); }
});

// 刮刮樂：1 點開刮
app.post('/api/scratch-win', async (req, res) => {
  const { email } = req.body;
  try {
    const userCheck = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    if ((userCheck.rows[0].points || 0) < 1) return res.status(400).json({ error: "積分不足" });

    const prizes = await pool.query('SELECT * FROM scratch_prizes');
    const totalWeight = prizes.rows.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.floor(Math.random() * totalWeight);
    let selected = prizes.rows[0];
    for (const p of prizes.rows) {
      if (random < p.weight) { selected = p; break; }
      random -= p.weight;
    }
    await pool.query('UPDATE users SET points = points - 1 + $1 WHERE email = $2', [selected.points_reward, email]);
    const updated = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    res.json({ prizeName: selected.name, newTotal: Number(updated.rows[0].points) });
  } catch (err) { res.status(500).send(); }
});

// 登入與資料同步 API
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0 && await bcrypt.compare(password, user.rows[0].password)) {
      res.json({ username: user.rows[0].username, email: user.rows[0].email, bio: user.rows[0].bio || '尚無介紹', points: Number(user.rows[0].points || 0) });
    } else if (user.rows.length === 0) {
      const hash = await bcrypt.hash(password, 10);
      const newUser = await pool.query('INSERT INTO users (username, email, password, points, bio) VALUES ($1,$2,$3,0,$4) RETURNING *', ["新用戶", email, hash, "網頁創作者"]);
      res.json({ username: newUser.rows[0].username, email: newUser.rows[0].email, bio: newUser.rows[0].bio, points: 0 });
    } else res.status(401).send();
  } catch (err) { res.status(500).send(); }
});

app.post('/api/get-user', async (req, res) => {
  const user = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
  if (user.rows.length > 0) res.json({ username: user.rows[0].username, email: user.rows[0].email, bio: user.rows[0].bio, points: Number(user.rows[0].points) });
  else res.status(404).send();
});

// 更新資料
app.post('/api/update-profile', async (req, res) => {
    const { email, username, bio, password } = req.body;
    if (password) {
        const hash = await bcrypt.hash(password, 10);
        await pool.query('UPDATE users SET username=$1, bio=$2, password=$3 WHERE email=$4', [username, bio, hash, email]);
    } else await pool.query('UPDATE users SET username=$1, bio=$2 WHERE email=$3', [username, bio, email]);
    res.json({ message: "OK" });
});

// 商品與訂單 API
app.get('/api/products', async (req, res) => { res.json((await pool.query('SELECT * FROM products ORDER BY id ASC')).rows); });
app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  const reward = Math.floor(Number(total) * 0.01);
  await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, Number(total), image_url]);
  await pool.query('UPDATE users SET points = COALESCE(points, 0) + $1 WHERE email = $2', [reward, email]);
  res.json({ reward });
});
app.get('/api/orders', async (req, res) => { res.json((await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email])).rows); });

app.listen(process.env.PORT || 3000, () => console.log('Server Ready'));
