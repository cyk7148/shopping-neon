const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 服務前端靜態檔案
app.use(express.static(path.join(__dirname, '../frontend')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// API: 取得商品
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// API: 註冊
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, email, password) VALUES ($1, $2, $3)', [username, email, hashed]);
    res.status(201).json({ message: "OK" });
  } catch (err) { res.status(400).json({ error: "Email exists" }); }
});

// API: 登入
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (user.rows.length > 0 && await bcrypt.compare(password, user.rows[0].password)) {
    res.json({ username: user.rows[0].username });
  } else { res.status(401).json({ error: "Fail" }); }
});

// 捕捉所有網頁請求回傳 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.listen(process.env.PORT || 3000);
