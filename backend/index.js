// 新增：更改密碼 API
app.post('/api/update-password', async (req, res) => {
  const { email, oldPassword, newPassword } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0) {
      // 驗證舊密碼
      const valid = await bcrypt.compare(oldPassword, user.rows[0].password);
      if (valid) {
        const hashedPswd = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPswd, email]);
        res.json({ message: "OK" });
      } else {
        res.status(401).json({ error: "舊密碼錯誤" });
      }
    } else {
      res.status(404).json({ error: "找不到使用者" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
