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

// 核心 API 邏輯
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  try {
    await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, parseInt(total), image_url]);
    res.json({ message: "OK" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (user.rows.length > 0 && await bcrypt.compare(password, user.rows[0].password)) {
    res.json({ username: user.rows[0].username, email: user.rows[0].email, bio: user.rows[0].bio });
  } else res.status(401).send();
});

app.post('/api/update-profile', async (req, res) => {
  const { email, username, bio } = req.body;
  if (username) await pool.query('UPDATE users SET username = $1 WHERE email = $2', [username, email]);
  if (bio) await pool.query('UPDATE users SET bio = $1 WHERE email = $2', [bio, email]);
  res.json({ message: "OK" });
});

app.listen(process.env.PORT || 3000, () => console.log('Server Start'));
