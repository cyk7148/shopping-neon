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
          bio: user.rows[0].bio || "這是一個神祕的萌商城會員" 
        });
      } else { res.status(401).json({ error: "密碼錯誤" }); }
    } else { res.status(404).json({ error: "帳號不存在" }); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 更新個人資料 API (暱稱與介紹)
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
