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

// 1. 取得商品
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: "DB Error" }); }
});

// 2. 結帳 + 1% 回饋 + 圖片紀錄
app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  const reward = Math.floor(Number(total) * 0.01); 
  try {
    await pool.query('BEGIN');
    await pool.query('INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1,$2,$3,$4)', [email, products, Number(total), image_url]);
    await pool.query('UPDATE users SET points = points + $1 WHERE email = $2', [reward, email]);
    await pool.query('COMMIT');
    res.json({ message: "OK", reward });
  } catch (err) { await pool.query('ROLLBACK'); res.status(500).send(); }
});

// 3. 刮刮樂邏輯
app.post('/api/scratch-win', async (req, res) => {
  const { email } = req.body;
  try {
    const userCheck = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    if (userCheck.rows[0].points < 10) return res.status(400).json({ error: "積分不足" });

    const prizes = await pool.query('SELECT * FROM scratch_prizes');
    const totalWeight = prizes.rows.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.floor(Math.random() * totalWeight);
    let selected = prizes.rows[0];
    
    for (const p of prizes.rows) {
      if (random < p.weight) { selected = p; break; }
      random -= p.weight;
    }

    await pool.query('UPDATE users SET points = points - 10 + $1 WHERE email = $2', [selected.points_reward, email]);
    const updatedUser = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    res.json({ prizeName: selected.name, newTotal: Number(updatedUser.rows[0].points) });
  } catch (err) { res.status(500).send(); }
});

// 4. 每日簽到
app.post('/api/daily-signin', async (req, res) => {
  try {
    await pool.query('UPDATE users SET points = points + 10 WHERE email = $1', [req.body.email]);
    res.json({ message: "OK" });
  } catch (err) { res.status(500).send(); }
});

// 5. 購買紀錄
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email]);
    res.json(result.rows);
  } catch (err) { res.status(500).send(); }
});

// 6. 登入/註冊合一
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0) {
      if (await bcrypt.compare(password, user.rows[0].password)) {
        res.json({ 
            username: user.rows[0].username, 
            email: user.rows[0].email, 
            points: Number(user.rows[0].points) // 強制轉數字
        });
      } else res.status(401).send();
    } else {
      const hash = await bcrypt.hash(password, 10);
      const newUser = await pool.query('INSERT INTO users (username, email, password, points) VALUES ($1, $2, $3, 0) RETURNING *', ["新用戶", email, hash]);
      res.json({ username: newUser.rows[0].username, email: newUser.rows[0].email, points: 0 });
    }
  } catch (err) { res.status(500).send(); }
});

// 7. 更新資料
app.post('/api/update-profile', async (req, res) => {
    const { email, username } = req.body;
    await pool.query('UPDATE users SET username = $1 WHERE email = $2', [username, email]);
    res.json({ message: "OK" });
});

app.listen(process.env.PORT || 3000, () => console.log('Server Ready'));
