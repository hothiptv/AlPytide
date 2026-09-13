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

// API Kiểm tra cú pháp + Thực thi
app.post('/api/run', (req, res) => {
  const { code } = req.body;

  if (code === undefined || code === null) {
    return res.status(400).json({ output: 'Lỗi: Không tìm thấy mã Python!' });
  }

  const fileName = `run_${Date.now()}_${Math.floor(Math.random() * 1000)}.py`;
  const filePath = path.join(__dirname, fileName);

  // 1. Ghi code ra file tạm
  fs.writeFile(filePath, code, (err) => {
    if (err) {
      return res.status(500).json({ output: `Lỗi lưu file server: ${err.message}` });
    }

    // 2. Server kiểm tra cú pháp Python trước (Syntax Check)
    exec(`python3 -m py_compile "${filePath}"`, (syntaxErr, syntaxStdout, syntaxStderr) => {
      if (syntaxErr) {
        // Nếu có lỗi cú pháp, Server trả về lỗi ngay lập tức
        fs.unlink(filePath, () => {});
        let cleanErr = syntaxStderr.replace(new RegExp(filePath, 'g'), 'main.py');
        return res.json({ 
          status: 'syntax_error',
          output: `❌ LỖI CÚ PHÁP (SERVER DETECTED):\n${cleanErr}` 
        });
      }

      // 3. Nếu cú pháp hợp lệ, Server tiến hành thực thi code
      exec(`python3 "${filePath}"`, { timeout: 5000, maxBuffer: 1024 * 512 }, (error, stdout, stderr) => {
        // Dọn dẹp file tạm
        fs.unlink(filePath, () => {});

        if (error && error.killed) {
          return res.json({ status: 'timeout', output: '⚠️ Lỗi: Thời gian chạy quá lâu (Timeout 5s)!' });
        }

        let result = stdout || '';
        if (stderr) {
          let cleanRuntimeErr = stderr.replace(new RegExp(filePath, 'g'), 'main.py');
          result += (result ? '\n' : '') + cleanRuntimeErr;
        }

        res.json({ 
          status: 'success', 
          output: result || 'Chương trình hoàn tất (Không có output).' 
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server AlPytide đang chạy tại port ${PORT}`);
});
