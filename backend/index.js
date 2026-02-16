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

// 取得商品列表
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 結帳並給予 1% 回饋
app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  const reward = Math.floor(Number(total) * 0.01); 
  try {
    await pool.query('BEGIN');
    await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, Number(total), image_url]);
    await pool.query('UPDATE users SET points = COALESCE(points, 0) + $1 WHERE email = $2', [reward, email]);
    await pool.query('COMMIT');
    res.json({ message: "OK", reward });
  } catch (err) { await pool.query('ROLLBACK'); res.status(500).send(); }
});

// 115 蛇年刮刮樂預測 API
app.post('/api/scratch-win', async (req, res) => {
  const { email } = req.body;
  try {
    const prizes = await pool.query('SELECT * FROM scratch_prizes');
    const selected = prizes.rows[Math.floor(Math.random() * prizes.rows.length)];
    await pool.query('UPDATE users SET points = COALESCE(points, 0) - 10 + $1 WHERE email = $2', [selected.points_reward, email]);
    const user = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    res.json({ prizeName: selected.name, newTotal: Number(user.rows[0].points || 0) });
  } catch (err) { res.status(500).send(); }
});

// 登入 API - 恢復回傳所有用戶資訊
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0 && await bcrypt.compare(password, user.rows[0].password)) {
      res.json({ 
        username: user.rows[0].username, 
        email: user.rows[0].email, 
        bio: user.rows[0].bio,
        points: Number(user.rows[0].points || 0) 
      });
    } else res.status(401).send();
  } catch (err) { res.status(500).send(); }
});

app.listen(process.env.PORT || 3000, () => console.log('萌伺服器啟動'));
