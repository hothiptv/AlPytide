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

    // Tự động kiểm tra import và cài thư viện thiếu trước khi chạy
    const imports = code.match(/^(?:import|from)\s+([a-zA-Z0-9_]+)/gm);
    let installCmd = '';

    if (imports) {
      const pkgs = [...new Set(imports.map(i => i.split(/\s+/)[1]))].filter(pkg => 
        !['sys', 'os', 'time', 'math', 'random', 'json', 're', 'datetime', 'urllib'].includes(pkg)
      );
      if (pkgs.length > 0) {
        installCmd = `pip install ${pkgs.join(' ')} && `;
      }
    }

    // Thực thi Python (Cho phép Timeout 10s để gọi API / lấy dữ liệu mạng)
    exec(`${installCmd}python3 "${filePath}"`, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      fs.unlink(filePath, () => {});

      if (error && error.killed) {
        return res.json({ status: 'timeout', output: '⚠️ Lỗi: Chương trình chạy quá 10 giây (Timeout)!' });
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
