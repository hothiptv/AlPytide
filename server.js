const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get(['/', '/index', '/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API thực thi mã Lua
app.post('/api/run', (req, res) => {
  const { code } = req.body;

  if (code === undefined || code === null) {
    return res.status(400).json({ output: 'Lỗi: Không tìm thấy mã Lua!' });
  }

  const fileName = `run_${Date.now()}_${Math.floor(Math.random() * 1000)}.lua`;
  const filePath = path.join(__dirname, fileName);

  // 1. Ghi file tạm
  fs.writeFile(filePath, code, (err) => {
    if (err) {
      return res.status(500).json({ output: `Lỗi ghi file server: ${err.message}` });
    }

    // 2. Chạy mã bằng LuaJIT (hoặc lua5.3), giới hạn timeout 5s để tránh treo
    exec(`luajit "${filePath}" || lua5.3 "${filePath}"`, { timeout: 5000, maxBuffer: 1024 * 512 }, (error, stdout, stderr) => {
      // Xóa file tạm ngay lập tức
      fs.unlink(filePath, () => {});

      if (error && error.killed) {
        return res.json({ status: 'timeout', output: '⚠️ Lỗi: Thời gian thực thi vượt quá 5 giây (Timeout)!' });
      }

      let result = stdout || '';
      if (stderr) {
        let cleanErr = stderr.replace(new RegExp(filePath, 'g'), 'main.lua');
        result += (result ? '\n' : '') + cleanErr;
      }

      res.json({
        status: 'success',
        output: result || 'Chương trình hoàn tất (Không có output).'
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server AlPytide đang chạy tại port ${PORT}`);
});
