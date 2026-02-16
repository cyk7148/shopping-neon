const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// 資料庫連線配置
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 靜態檔案服務
app.use(express.static(path.join(__dirname, '../frontend')));

// 1. 取得商品列表
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. 登入 API
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
          bio: user.rows[0].bio,
          points: user.rows[0].points 
        });
      } else {
        res.status(401).json({ error: "密碼錯誤" });
      }
    } else {
      res.status(404).json({ error: "用戶不存在" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. 結帳與積分反饋 API (0.1% 算法)
app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  const rewardPoints = Math.floor(total * 0.001); // 0.1% 點數回饋邏輯
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 存入訂單紀錄
      await client.query(
        'INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1, $2, $3, $4)',
        [email, products, parseInt(total), image_url]
      );
      // 更新用戶積分
      await client.query(
        'UPDATE users SET points = points + $1 WHERE email = $2',
        [rewardPoints, email]
      );
      await client.query('COMMIT');
      res.json({ message: "OK", reward: rewardPoints });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. 取得購買紀錄
app.get('/api/orders', async (req, res) => {
  const { email } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', 
      [email]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. 更新個人資料 (暱稱、介紹)
app.post('/api/update-profile', async (req, res) => {
  const { email, username, bio } = req.body;
  try {
    if (username) await pool.query('UPDATE users SET username = $1 WHERE email = $2', [username, email]);
    if (bio) await pool.query('UPDATE users SET bio = $1 WHERE email = $2', [bio, email]);
    res.json({ message: "OK" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. 安全更改密碼 API
app.post('/api/update-password', async (req, res) => {
  const { email, oldPassword, newPassword } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0) {
      // 比對舊密碼是否正確
      const valid = await bcrypt.compare(oldPassword, user.rows[0].password);
      if (valid) {
        const hashedPswd = await bcrypt.hash(newPassword, 10); // 加密新密碼
        await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPswd, email]);
        res.json({ message: "OK" });
      } else {
        res.status(401).json({ error: "舊密碼驗證失敗" });
      }
    } else {
      res.status(404).json({ error: "帳號異常" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. 簽到領取積分 API
app.post('/api/daily-signin', async (req, res) => {
  const { email } = req.body;
  try {
    await pool.query('UPDATE users SET points = points + 10 WHERE email = $1', [email]);
    res.json({ message: "OK", pointsAdded: 10 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`萌伺服器已在端口 ${PORT} 啟動`));
