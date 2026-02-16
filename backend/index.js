const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// 資料庫連線
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.static(path.join(__dirname, '../frontend')));

// 登入 API
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0) {
      const valid = await bcrypt.compare(password, user.rows[0].password);
      if (valid) {
        res.json({ 
          username: user.rows[0].username, 
          email: user.rows[0].email,
          bio: user.rows[0].bio || "這是一個神秘的萌商城會員" 
        });
      } else { res.status(401).json({ error: "密碼錯誤" }); }
    } else { res.status(404).json({ error: "帳號不存在" }); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 更新介紹 API (核心修正)
app.post('/api/update-bio', async (req, res) => {
  const { email, bio } = req.body;
  if (!email) return res.status(400).json({ error: "缺少 Email" });
  try {
    await pool.query('UPDATE users SET bio = $1 WHERE email = $2', [bio, email]);
    res.json({ message: "Success" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 修改密碼 API
app.post('/api/update-password', async (req, res) => {
  const { email, newPassword } = req.body;
  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashed, email]);
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
app.listen(PORT, () => console.log(`Server online`));
