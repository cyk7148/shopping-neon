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

// 【重要修復】結帳 API 欄位對齊
app.post('/api/checkout', async (req, res) => {
  const { email, products, total } = req.body;
  if (!email || !products) return res.status(400).json({ error: "資訊不完整" });
  
  try {
    // 確保 total 為整數存入
    await pool.query(
      'INSERT INTO orders (user_email, product_name, total_price) VALUES ($1, $2, $3)',
      [email, products, parseInt(total)]
    );
    res.json({ message: "結帳成功" });
  } catch (err) {
    console.error("結帳存檔失敗:", err.message);
    res.status(500).json({ error: "伺服器存檔錯誤: " + err.message });
  }
});

app.get('/api/orders', async (req, res) => {
  const { email } = req.query;
  try {
    const result = await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [email]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0) {
      const valid = await bcrypt.compare(password, user.rows[0].password);
      if (valid) { res.json({ username: user.rows[0].username, email: user.rows[0].email, bio: user.rows[0].bio }); }
      else { res.status(401).json({ error: "密碼錯誤" }); }
    } else { res.status(404).json({ error: "帳號不存在" }); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/update-profile', async (req, res) => {
  const { email, username, bio } = req.body;
  try {
    if (username) await pool.query('UPDATE users SET username = $1 WHERE email = $2', [username, email]);
    if (bio) await pool.query('UPDATE users SET bio = $1 WHERE email = $2', [bio, email]);
    res.json({ message: "更新成功" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`伺服器運行中`));
