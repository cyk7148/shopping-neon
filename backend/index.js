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

// 登入 API：處理積分數值
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0 && await bcrypt.compare(password, user.rows[0].password)) {
      const u = user.rows[0];
      res.json({ 
        username: u.username, 
        email: u.email, 
        bio: u.bio, 
        points: parseInt(u.points || 0) // 確保回傳數字型態
      });
    } else res.status(401).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 結帳 API：整合 1% 回饋
app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  const reward = Math.floor(parseInt(total) * 0.01); // 1% 算法
  try {
    await pool.query('BEGIN');
    await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, parseInt(total), image_url]);
    await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [reward, email]);
    await pool.query('COMMIT');
    res.json({ message: "OK", reward });
  } catch (err) { await pool.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
});

// 其他 API (products, orders, daily-signin) 保持不變...
app.get('/api/products', async (req, res) => {
  const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
  res.json(result.rows);
});

app.listen(process.env.PORT || 3000, () => console.log('萌伺服器運行中'));
