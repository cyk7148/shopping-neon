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

// 1. 每日簽到 (終極修復版：日期字串比對)
app.post('/api/daily-signin', async (req, res) => {
  const { email } = req.body;
  try {
    const userRes = await pool.query('SELECT last_signin_date FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "用戶不存在" });

    const lastDate = userRes.rows[0].last_signin_date;
    // 使用 ISO 日期字串 (YYYY-MM-DD) 進行比對，忽略時分秒
    const today = new Date().toISOString().split('T')[0];

    if (lastDate) {
        // 將資料庫日期轉為同樣格式
        const dbDate = new Date(lastDate).toISOString().split('T')[0];
        if (dbDate === today) {
            return res.status(400).json({ error: "今天已經簽到過了喔！" });
        }
    }

    // 簽到成功：+10 分並更新日期
    await pool.query('UPDATE users SET points = COALESCE(points, 0) + 10, last_signin_date = CURRENT_DATE WHERE email = $1', [email]);
    res.json({ message: "OK" });
  } catch (err) { 
    console.error(err);
    res.status(500).json({ error: "系統忙碌中" }); 
  }
});

// 2. 登入 (回傳 bio 與 points)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0) {
      if (await bcrypt.compare(password, user.rows[0].password)) {
        res.json({ 
            username: user.rows[0].username, 
            email: user.rows[0].email, 
            bio: user.rows[0].bio || '尚無介紹',
            points: Number(user.rows[0].points || 0) 
        });
      } else res.status(401).send();
    } else {
      // 自動註冊
      const hash = await bcrypt.hash(password, 10);
      const newUser = await pool.query('INSERT INTO users (username, email, password, points, bio) VALUES ($1, $2, $3, 0, $4) RETURNING *', ["新用戶", email, hash, "網頁創作者"]);
      res.json({ username: newUser.rows[0].username, email: newUser.rows[0].email, bio: newUser.rows[0].bio, points: 0 });
    }
  } catch (err) { res.status(500).send(); }
});

// 3. 更新會員資料 (支援改密碼)
app.post('/api/update-profile', async (req, res) => {
    const { email, username, bio, password } = req.body;
    try {
        if (password && password.trim() !== "") {
            const hash = await bcrypt.hash(password, 10);
            await pool.query('UPDATE users SET username = $1, bio = $2, password = $3 WHERE email = $4', [username, bio, hash, email]);
        } else {
            await pool.query('UPDATE users SET username = $1, bio = $2 WHERE email = $3', [username, bio, email]);
        }
        res.json({ message: "OK" });
    } catch (err) { res.status(500).json({ error: "Update failed" }); }
});

// 4. 取得商品
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: "DB Error" }); }
});

// 5. 結帳
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

// 6. 刮刮樂
app.post('/api/scratch-win', async (req, res) => {
  const { email } = req.body;
  try {
    const userCheck = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    if ((userCheck.rows[0].points || 0) < 10) return res.status(400).json({ error: "積分不足" });

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

// 7. 購買紀錄
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', [req.query.email]);
    res.json(result.rows);
  } catch (err) { res.status(500).send(); }
});

app.listen(process.env.PORT || 3000, () => console.log('Server Ready'));
