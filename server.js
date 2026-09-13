const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API kiểm tra trạng thái Server
app.get('/', (req, res) => {
  res.send({ status: 'AlPytide Server is running!' });
});

// API thực thi Python
app.post('/api/run', (req, res) => {
  const { code } = req.body;

  if (code === undefined) {
    return res.status(400).json({ output: 'Lỗi: Không tìm thấy mã Python!' });
  }

  // Tạo file tạm temp_code.py
  const filePath = path.join(__dirname, 'temp_code.py');

  fs.writeFile(filePath, code, (err) => {
    if (err) {
      return res.status(500).json({ output: `Lỗi ghi file server: ${err.message}` });
    }

    // Thực thi Python với thời gian chờ tối đa 10 giây (tránh vòng lặp vô tận)
    exec(`python3 "${filePath}"`, { timeout: 10000 }, (error, stdout, stderr) => {
      // Dọn dẹp file tạm sau khi chạy
      fs.unlink(filePath, () => {});

      if (error && error.killed) {
        return res.json({ output: 'Lỗi: Thời gian thực thi vượt quá giới hạn (Timeout 10s)!' });
      }

      let result = '';
      if (stdout) result += stdout;
      if (stderr) result += (result ? '\n' : '') + stderr;

      res.json({ output: result || 'Chương trình hoàn tất (Không có output).' });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server AlPytide đang chạy tại port ${PORT}`);
});
