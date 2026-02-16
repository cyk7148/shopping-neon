const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();

// 中間件設定
app.use(express.json());
app.use(cors());

// 1. 資料庫連線設定
// 請確保在 Render 的 Environment Variables 中設定了 DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Neon 要求加密連線
  }
});

// 2. 靜態檔案服務 (指向前端資料夾)
app.use(express.static(path.join(__dirname, '../frontend')));

// 3. API: 使用者登入
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0) {
      // 比對加密後的密碼
      const validPassword = await bcrypt.compare(password, user.rows[0].password);
      if (validPassword) {
        res.json({ 
          username: user.rows[0].username, 
          email: user.rows[0].email,
          bio: user.rows[0].bio || "這是一個神祕的萌商城會員。" 
        });
      } else {
        res.status(401).json({ error: "密碼錯誤" });
      }
    } else {
      res.status(404).json({ error: "找不到此帳號" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "伺服器發生錯誤" });
  }
});

// 4. API: 更新個人介紹 (Bio)
app.post('/api/update-bio', async (req, res) => {
  const { email, bio } = req.body;
  try {
    await pool.query('UPDATE users SET bio = $1 WHERE email = $2', [bio, email]);
    res.json({ message: "個人介紹更新成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "資料庫寫入失敗" });
  }
});

// 5. API: 修改密碼
app.post('/api/update-password', async (req, res) => {
  const { email, newPassword } = req.body;
  try {
    // 儲存前先將密碼雜湊加密，保障隱私安全
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);
    res.json({ message: "密碼修改成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "密碼更新失敗" });
  }
});

// 6. API: 獲取所有商品列表
app.get('/api/products', async (req, res) => {
  try {
    // 依 ID 排序確保「猴猴的烏薩奇」顯示在第一位
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "無法載入商品" });
  }
});

// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`萌商城後端運行於 port ${PORT}`);
});
