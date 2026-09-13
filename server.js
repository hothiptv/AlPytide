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

app.post('/api/run', (req, res) => {
  const { code } = req.body;

  if (code === undefined || code === null) {
    return res.status(400).json({ output: 'Lỗi: Không có code Python!' });
  }

  // 1. Kiểm tra nhanh xem code có chứa input() không để ngắt ngay
  if (/input\s*\(/.test(code)) {
    return res.json({ 
      output: '⚠️ Lỗi: Web IDE hiện chưa hỗ trợ hàm input() tương tác trực tiếp. Hãy gán biến trực tiếp (ví dụ: luachon = "1") để chạy thử code!' 
    });
  }

  const fileName = `run_${Date.now()}_${Math.floor(Math.random() * 1000)}.py`;
  const filePath = path.join(__dirname, fileName);

  fs.writeFile(filePath, code, (err) => {
    if (err) {
      return res.status(500).json({ output: `Lỗi ghi file server: ${err.message}` });
    }

    // Chạy trực tiếp Python với timeout 15 giây
    exec(`python3 "${filePath}"`, { timeout: 15000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      fs.unlink(filePath, () => {});

      if (error && error.killed) {
        return res.json({ status: 'timeout', output: '⚠️ Lỗi: Chương trình chạy quá 15 giây hoặc dính vòng lặp vô hạn (while True)!' });
      }

      let result = stdout || '';
      if (stderr) {
        let cleanErr = stderr.replace(new RegExp(filePath, 'g'), 'main.py');
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
  console.log(`Server AlPytide Python đang chạy tại port ${PORT}`);
});
