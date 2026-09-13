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

  const fileName = `run_${Date.now()}_${Math.floor(Math.random() * 1000)}.py`;
  const filePath = path.join(__dirname, fileName);

  fs.writeFile(filePath, code, (err) => {
    if (err) {
      return res.status(500).json({ output: `Lỗi ghi file server: ${err.message}` });
    }

    // Tăng timeout lên 20 giây để tránh ngắt kết nối quá sớm
    exec(`python3 "${filePath}"`, { timeout: 20000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      fs.unlink(filePath, () => {});

      if (error && error.killed) {
        return res.json({ 
          status: 'timeout', 
          output: '⚠️ Lỗi: Chương trình chạy quá 20 giây hoặc kẹt lệnh chờ nhập liệu (input) vô hạn!' 
        });
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
