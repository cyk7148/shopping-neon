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

// 【新增】結帳 API：將購物車內容存入資料庫
app.post('/api/checkout', async (req, res) => {
  const { email, products, total } = req.body;
  try {
    await pool.query(
      'INSERT INTO orders (user_email, product_name, total_price) VALUES ($1, $2, $3)',
      [email, products, total]
    );
    res.json({ message: "Order created" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 【新增】取得訂單 API：讓會員中心能讀取
app.get('/api/orders', async (req, res) => {
  const email = req.query.email;
  try {
    const result = await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [email]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 登入與更新個人資料 API
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0) {
      const valid = await bcrypt.compare(password, user.rows[0].password);
      if (valid) {
        res.json({ username: user.rows[0].username, email: user.rows[0].email, bio: user.rows[0].bio });
      } else { res.status(401).json({ error: "Wrong password" }); }
    } else { res.status(404).json({ error: "User not found" }); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/update-profile', async (req, res) => {
  const { email, username, bio } = req.body;
  try {
    await pool.query('UPDATE users SET username = $1, bio = $2 WHERE email = $3', [username, bio, email]);
    res.json({ message: "Success" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server Online`));
