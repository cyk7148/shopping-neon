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

// 1. 取得商品列表
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// 2. 結帳 (1% 回饋 + 圖片紀錄)
app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  const reward = Math.floor(Number(total) * 0.01); // 強制轉數字
  
  try {
    await pool.query('BEGIN');
    // 寫入訂單
    await pool.query(
        'INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1, $2, $3, $4)', 
        [email, products, Number(total), image_url]
    );
    // 更新積分 (使用 COALESCE 防止 null)
    await pool.query(
        'UPDATE users SET points = COALESCE(points, 0) + $1 WHERE email = $2', 
        [reward, email]
    );
    await pool.query('COMMIT');
    res.json({ message: "OK", reward });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).send();
  }
});

// 3. 刮刮樂 (扣除積分 + 隨機獎勵)
app.post('/api/scratch-win', async (req, res) => {
  const { email } = req.body;
  try {
    // 檢查積分
    const userCheck = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    if ((userCheck.rows[0].points || 0) < 10) return res.status(400).json({ error: "積分不足" });

    // 隨機抽獎
    const prizes = await pool.query('SELECT * FROM scratch_prizes');
    const totalWeight = prizes.rows.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.floor(Math.random() * totalWeight);
    let selected = prizes.rows[0];
    
    for (const p of prizes.rows) {
      if (random < p.weight) { selected = p; break; }
      random -= p.weight;
    }

    // 更新積分
    await pool.query(
        'UPDATE users SET points = COALESCE(points, 0) - 10 + $1 WHERE email = $2', 
        [selected.points_reward, email]
    );
    
    // 回傳最新積分
    const updatedUser = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    res.json({ prizeName: selected.name, newTotal: Number(updatedUser.rows[0].points) });
  } catch (err) {
    res.status(500).send();
  }
});

// 4. 每日簽到
app.post('/api/daily-signin', async (req, res) => {
  try {
    await pool.query(
        'UPDATE users SET points = COALESCE(points, 0) + 10 WHERE email = $1', 
        [req.body.email]
    );
    res.json({ message: "OK" });
  } catch (err) { res.status(500).send(); }
});

// 5. 購買紀錄查詢
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query(
        'SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC', 
        [req.query.email]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).send(); }
});

// 6. 登入/自動註冊 (支援 Bio 與 Points 數字化)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (user.rows.length > 0) {
      // 舊用戶登入
      if (await bcrypt.compare(password, user.rows[0].password)) {
        res.json({ 
            username: user.rows[0].username, 
            email: user.rows[0].email, 
            bio: user.rows[0].bio || '尚無介紹', // 回傳 Bio
            points: Number(user.rows[0].points || 0) 
        });
      } else {
        res.status(401).send();
      }
    } else {
      // 新用戶自動註冊
      const hash = await bcrypt.hash(password, 10);
      const newUser = await pool.query(
          'INSERT INTO users (username, email, password, points, bio) VALUES ($1, $2, $3, 0, $4) RETURNING *', 
          ["新用戶", email, hash, "網頁創作者"]
      );
      res.json({ 
          username: newUser.rows[0].username, 
          email: newUser.rows[0].email, 
          bio: newUser.rows[0].bio,
          points: 0 
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send();
  }
});

// 7. 更新會員資料 (支援 暱稱、自介、密碼修改)
app.post('/api/update-profile', async (req, res) => {
    const { email, username, bio, password } = req.body;
    try {
        if (password && password.trim() !== "") {
            // 如果使用者有輸入新密碼，加密後一起更新
            const hash = await bcrypt.hash(password, 10);
            await pool.query(
                'UPDATE users SET username = $1, bio = $2, password = $3 WHERE email = $4', 
                [username, bio, hash, email]
            );
        } else {
            // 如果沒輸入密碼，只更新暱稱和自介
            await pool.query(
                'UPDATE users SET username = $1, bio = $2 WHERE email = $3', 
                [username, bio, email]
            );
        }
        res.json({ message: "OK" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Update failed" });
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Server is running on port 3000'));
