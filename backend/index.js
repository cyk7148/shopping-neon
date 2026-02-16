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

// 靜態檔案服務
app.use(express.static(path.join(__dirname, '../frontend')));

// API: 登入 (回傳使用者名稱、Email與自我介紹)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0) {
      const validPassword = await bcrypt.compare(password, user.rows[0].password);
      if (validPassword) {
        res.json({ 
          username: user.rows[0].username, 
          email: user.rows[0].email,
          bio: user.rows[0].bio || "這是一個神祕的豬豬商城會員。" 
        });
      } else { res.status(401).json({ error: "密碼錯誤" }); }
    } else { res.status(404).json({ error: "找不到此帳號" }); }
  } catch (err) { res.status(500).json({ error: "伺服器錯誤" }); }
});

// API: 更新個人介紹
app.post('/api/update-bio', async (req, res) => {
  const { email, bio } = req.body;
  try {
    await pool.query('UPDATE users SET bio = $1 WHERE email = $2', [bio, email]);
    res.json({ message: "更新成功" });
  } catch (err) { res.status(500).json({ error: "更新失敗" }); }
});

// API: 獲取商品列表
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: "載入失敗" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
