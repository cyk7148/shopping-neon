const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path'); // 新增這行
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 1. 讓後端可以讀取 frontend 資料夾裡的檔案
app.use(express.static(path.join(__dirname, '../frontend')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- 原有的 API 路由保留 ---
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. 讓所有網址請求都指向你的 index.html (這行最重要)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`全站已啟動，埠號：${PORT}`));
