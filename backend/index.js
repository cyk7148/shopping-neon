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

app.use(express.static(path.join(__dirname, '../frontend')));

// 1. 取得商品列表 - 確保前端不空白的關鍵
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('抓取商品失敗:', err);
    res.status(500).json({ error: "資料庫連線失敗" });
  }
});

// 2. 結帳功能：包含 1% 積分回饋與圖文紀錄存儲
app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body;
  // 強制轉為數字計算，防止產生 NaN
  const reward = Math.floor(Number(total) * 0.01); 

  try {
    await pool.query('BEGIN');
    // 寫入購買紀錄，包含商品縮圖
    await pool.query(
      'INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1, $2, $3, $4)',
      [email, products, Number(total), image_url]
    );
    // 更新積分：使用 COALESCE 確保 null 值會被當作 0 運算，解決 NaN 問題
    await pool.query(
      'UPDATE users SET points = COALESCE(points, 0) + $1 WHERE email = $2',
      [reward, email]
    );
    await pool.query('COMMIT');
    res.json({ message: "OK", reward });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('結帳失敗:', err);
    res.status(500).send();
  }
});

// 3. 115 蛇年刮刮樂預測 API
app.post('/api/scratch-win', async (req, res) => {
  const { email } = req.body;
  const cost = 10; // 每次消耗 10 積分

  try {
    // 取得所有獎項權重
    const prizes = await pool.query('SELECT * FROM scratch_prizes');
    const totalWeight = prizes.rows.reduce((sum, p) => sum + p.weight, 0);
    
    // 隨機抽選邏輯
    let random = Math.floor(Math.random() * totalWeight);
    let selected = prizes.rows[0];
    for (const p of prizes.rows) {
      if (random < p.weight) {
        selected = p;
        break;
      }
      random -= p.weight;
    }

    //扣除積分並發放獎勵
    await pool.query(
      'UPDATE users SET points = COALESCE(points, 0) - $1 + $2 WHERE email = $3',
      [cost, selected.points_reward, email]
    );

    // 取得最新積分回傳前端
    const user = await pool.query('SELECT points FROM users WHERE email = $1', [email]);
    res.json({ 
      prizeName: selected.name, 
      reward: selected.points_reward, 
      newTotal: Number(user.rows[0].points || 0) 
    });
  } catch (err) {
    console.error('刮刮樂失敗:', err);
    res.status(500).send();
  }
});

// 4. 每日簽到功能
app.post('/api/daily-signin', async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET points = COALESCE(points, 0) + 10 WHERE email = $1',
      [req.body.email]
    );
    res.json({ message: "OK" });
  } catch (err) {
    res.status(500).send();
  }
});

// 5. 取得購買紀錄
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE user_email = $1 ORDER BY order_date DESC',
      [req.query.email]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).send();
  }
});

// 6. 登入 API - 確保回傳數字積分
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0 && await bcrypt.compare(password, user.rows[0].password)) {
      res.json({ 
        username: user.rows[0].username, 
        email: user.rows[0].email, 
        points: Number(user.rows[0].points || 0) // 強制轉為數字
      });
    } else {
      res.status(401).send();
    }
  } catch (err) {
    res.status(500).send();
  }
});

app.listen(process.env.PORT || 3000, () => console.log('萌伺服器已就緒'));
