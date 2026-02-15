const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // 用於加密密碼
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 連接 Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- API 路由 ---

// 1. 取得所有商品 (Daniel, Alan 等)
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. 註冊新帳號
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3)',
      [username, email, hashedPassword]
    );
    res.status(201).json({ message: "註冊成功" });
  } catch (err) {
    res.status(400).json({ error: "Email 可能已被使用" });
  }
});

// 3. 登入
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0) {
      const valid = await bcrypt.compare(password, user.rows[0].password);
      if (valid) return res.json({ username: user.rows[0].username, message: "登入成功" });
    }
    res.status(401).json({ error: "帳號或密碼錯誤" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`伺服器運行於埠號 ${PORT}`));
