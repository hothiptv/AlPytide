const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    engine: 'AlPytide Python Engine (Docker)',
    version: '1.1.0',
    timeout_limit: '15 seconds',
    rate_limit: '30 executions per 3 minutes'
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const processes = new Map();
const userLimits = new Map(); // Quản lý lượt dùng (Rate Limiting)

const EXECUTION_TIMEOUT = 15000; // 15s timeout
const MAX_RUNS = 30; // 30 lượt
const COOLDOWN_TIME = 3 * 60 * 1000; // 3 phút = 180,000 ms

// Hàm dọn dẹp thư mục tạm
function cleanupDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

io.on('connection', (socket) => {
  const userIp = socket.handshake.address;

  // Khởi tạo hạn ngạch người dùng
  if (!userLimits.has(userIp)) {
    userLimits.set(userIp, { runsLeft: MAX_RUNS, resetTime: null });
  }

  // Tạo thư mục tạm cách ly cho mỗi socket session
  const sessionDir = path.join(__dirname, 'tmp_sessions', socket.id);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  socket.on('run_code', (data) => {
    const limitInfo = userLimits.get(userIp);
    const now = Date.now();

    // Kiểm tra reset thời gian 3 phút
    if (limitInfo.resetTime && now >= limitInfo.resetTime) {
      limitInfo.runsLeft = MAX_RUNS;
      limitInfo.resetTime = null;
    }

    // Kiểm tra nếu hết lượt
    if (limitInfo.runsLeft <= 0) {
      const remainingSeconds = Math.ceil((limitInfo.resetTime - now) / 1000);
      socket.emit('output', { 
        type: 'stderr', 
        data: `\n[Lỗi Hạn Ngạch: Bạn đã dùng hết 30 lượt chạy. Vui lòng chờ ${remainingSeconds} giây nữa để reset 30 lượt mới.]\n` 
      });
      socket.emit('rate_limit_exceeded', { remainingSeconds });
      socket.emit('process_exit', { code: 429 });
      return;
    }

    // Trừ lượt dùng
    limitInfo.runsLeft--;
    if (limitInfo.runsLeft === 0 && !limitInfo.resetTime) {
      limitInfo.resetTime = now + COOLDOWN_TIME;
    }

    socket.emit('rate_update', { 
      runsLeft: limitInfo.runsLeft, 
      resetTime: limitInfo.resetTime 
    });

    // Nếu đang có tiến trình cũ chưa xong thì kill
    if (processes.has(socket.id)) {
      clearTimeout(processes.get(socket.id).timer);
      processes.get(socket.id).proc.kill();
    }

    // Nhận dữ liệu code và files phụ từ client
    const { mainCode, files } = typeof data === 'string' ? { mainCode: data, files: [] } : data;

    // Ghi các file đính kèm (nếu có) vào thư mục tạm của session
    if (Array.isArray(files)) {
      files.forEach(file => {
        if (file.name && file.content !== undefined) {
          const filePath = path.join(sessionDir, file.name);
          fs.writeFileSync(filePath, file.content, 'utf-8');
        }
      });
    }

    // Ghi file main.py
    const mainFilePath = path.join(sessionDir, 'main.py');
    let formattedCode = (mainCode || '').replace(/\r\n/g, '\n').replace(/\t/g, '    ');
    fs.writeFileSync(mainFilePath, formattedCode, 'utf-8');

    // Chạy Python từ thư mục cách ly
    const pythonProcess = spawn('python3', ['-u', 'main.py'], { cwd: sessionDir });

    const timer = setTimeout(() => {
      if (processes.has(socket.id)) {
        pythonProcess.kill();
        socket.emit('output', { type: 'stderr', data: '\n[Lỗi: Thời gian thực thi vượt quá giới hạn 15s]\n' });
        socket.emit('process_exit', { code: 124 });
        processes.delete(socket.id);
      }
    }, EXECUTION_TIMEOUT);

    processes.set(socket.id, { proc: pythonProcess, timer });

    pythonProcess.stdout.on('data', (data) => {
      socket.emit('output', { type: 'stdout', data: data.toString('utf-8') });
    });

    pythonProcess.stderr.on('data', (data) => {
      socket.emit('output', { type: 'stderr', data: data.toString('utf-8') });
    });

    pythonProcess.on('close', (exitCode) => {
      if (processes.has(socket.id)) {
        clearTimeout(processes.get(socket.id).timer);
        processes.delete(socket.id);
      }

      // Đọc và trả về danh sách các file txt/json hoặc biểu đồ được tạo ra
      try {
        const createdFiles = fs.readdirSync(sessionDir);
        const outputFiles = [];
        const charts = [];

        createdFiles.forEach(file => {
          const fullPath = path.join(sessionDir, file);
          const ext = path.extname(file).toLowerCase();

          // Xử lý File Text & JSON
          if (ext === '.txt' || ext === '.json') {
            const content = fs.readFileSync(fullPath, 'utf-8');
            outputFiles.push({ name: file, content });
          }

          // Xử lý Biểu đồ Matplotlib (File ảnh .png, .jpg)
          if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
            const imgBuffer = fs.readFileSync(fullPath);
            const base64Img = `data:image/${ext.replace('.', '')};base64,${imgBuffer.toString('base64')}`;
            charts.push({ name: file, data: base64Img });
          }
        });

        if (outputFiles.length > 0) socket.emit('files_generated', outputFiles);
        if (charts.length > 0) socket.emit('charts_generated', charts);

      } catch (e) {
        console.error('Error reading generated files:', e);
      }

      socket.emit('process_exit', { code: exitCode });
    });

    pythonProcess.on('error', (err) => {
      socket.emit('output', { type: 'stderr', data: `Lỗi Container: ${err.message}\n` });
      if (processes.has(socket.id)) {
        clearTimeout(processes.get(socket.id).timer);
        processes.delete(socket.id);
      }
      socket.emit('process_exit', { code: 1 });
    });
  });

  socket.on('input_data', (data) => {
    const processData = processes.get(socket.id);
    if (processData && processData.proc.stdin.writable) {
      processData.proc.stdin.write(data + '\n');
    }
  });

  socket.on('disconnect', () => {
    if (processes.has(socket.id)) {
      clearTimeout(processes.get(socket.id).timer);
      processes.get(socket.id).proc.kill();
      processes.delete(socket.id);
    }
    // Dọn dẹp bộ nhớ tạm khi ngắt kết nối
    cleanupDirectory(sessionDir);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`=== AlPytide API Engine Container v1.1.0 running on port ${PORT} ===`);
});
