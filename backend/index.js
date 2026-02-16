const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Neon 資料庫配置
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.static(path.join(__dirname, '../frontend')));

// [API] 取得商品列表
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [API] 登入並取得用戶積分
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
      } else res.status(401).json({ error: "密碼錯誤" });
    } else res.status(404).json({ error: "用戶不存在" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [API] 結帳 + 1% 積分回饋算法
app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  const reward = Math.floor(parseInt(total) * 0.01); // 1% 積分算法
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 寫入訂單
      await client.query(
        'INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1, $2, $3, $4)',
        [email, products, parseInt(total), image_url]
      );
      // 更新積分
      await client.query(
        'UPDATE users SET points = points + $1 WHERE email = $2',
        [reward, email]
      );
      await client.query('COMMIT');
      res.json({ message: "OK", reward });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [API] 取得購買紀錄
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', 
      [req.query.email]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [API] 更新個人資料
app.post('/api/update-profile', async (req, res) => {
  const { email, username, bio } = req.body;
  try {
    if (username) await pool.query('UPDATE users SET username = $1 WHERE email = $2', [username, email]);
    if (bio) await pool.query('UPDATE users SET bio = $1 WHERE email = $2', [bio, email]);
    res.json({ message: "OK" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [API] 簽到領積分
app.post('/api/daily-signin', async (req, res) => {
  try {
    await pool.query('UPDATE users SET points = points + 10 WHERE email = $1', [req.body.email]);
    res.json({ message: "OK" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`萌伺服器啟動於 ${PORT}`));
