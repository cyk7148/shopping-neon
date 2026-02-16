// 【結帳 API 更新】增加圖片網址存檔
app.post('/api/checkout', async (req, res) => {
  const { email, products, total, image_url } = req.body; // 接收前端傳來的縮圖
  
  if (!email || !products) return res.status(400).json({ error: "資訊不完整" });

  try {
    const numericTotal = parseInt(total);
    // 將商品清單、總價與縮圖一併存入
    await pool.query(
      'INSERT INTO orders (user_email, product_name, total_price, image_url) VALUES ($1, $2, $3, $4)',
      [email, products, numericTotal, image_url]
    );
    res.json({ message: "結帳成功" });
  } catch (err) {
    console.error("存檔失敗:", err.message);
    res.status(500).json({ error: "資料庫寫入失敗" });
  }
});
