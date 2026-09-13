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

// Cấu hình theo tài liệu Engine v1.2
const EXECUTION_TIMEOUT = 60 * 1000; // Timeout 1 phút (60 giây)
const SHUTDOWN_LIMIT = 10 * 60 * 1000; // Tắt hoàn toàn tiến trình sau 10 phút
const MAX_RUNS = 30; // Tối đa 30 lượt chạy
const COOLDOWN_TIME = 3 * 60 * 1000; // Cooldown 3 phút (180 giây)

// Đường dẫn file lưu trữ hạn ngạch local
const LIMITS_FILE = path.join(__dirname, 'rate_limits.json');

// Hàm đọc dữ liệu Hạn ngạch từ file local
function loadUserLimits() {
  try {
    if (fs.existsSync(LIMITS_FILE)) {
      const data = fs.readFileSync(LIMITS_FILE, 'utf-8');
      return new Map(Object.entries(JSON.parse(data)));
    }
  } catch (err) {
    console.error('[Lỗi Đọc File Hạn Ngạch]:', err.message);
  }
  return new Map();
}

// Hàm ghi dữ liệu Hạn ngạch vào file local
function saveUserLimits(map) {
  try {
    const obj = Object.fromEntries(map);
    fs.writeFileSync(LIMITS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Lỗi Lưu File Hạn Ngạch]:', err.message);
  }
}

const userLimits = loadUserLimits();
const processes = new Map();

// Endpoint kiểm tra trạng thái Engine v1.2
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    engine: 'AlPytide Python Engine (Docker Sandbox)',
    version: '1.2.0',
    timeout_limit: '1 minute (60s)',
    max_execution_limit: '10 minutes',
    rate_limit: '30 executions per 3 minutes'
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Hàm dọn dẹp thư mục tạm
function cleanupDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

io.on('connection', (socket) => {
  // Lấy IP của Client (Hỗ trợ qua Proxy/Render)
  const userIp = socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() || socket.handshake.address;

  // Khởi tạo hạn ngạch cho IP mới nếu chưa tồn tại
  if (!userLimits.has(userIp)) {
    userLimits.set(userIp, { runsLeft: MAX_RUNS, resetTime: null });
    saveUserLimits(userLimits);
  }

  const limitInfo = userLimits.get(userIp);
  const now = Date.now();

  // Kiểm tra xem đã hết thời gian đếm ngược (cooldown) để reset lại lượt chưa
  if (limitInfo.resetTime && now >= limitInfo.resetTime) {
    limitInfo.runsLeft = MAX_RUNS;
    limitInfo.resetTime = null;
    saveUserLimits(userLimits);
  }

  // Gửi trạng thái lượt chạy ban đầu ngay khi client kết nối
  socket.emit('rate_update', { 
    runsLeft: limitInfo.runsLeft, 
    resetTime: limitInfo.resetTime,
    maxRuns: MAX_RUNS
  });

  // Tạo thư mục tạm cách ly cho mỗi socket session
  const sessionDir = path.join(__dirname, 'tmp_sessions', socket.id);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  socket.on('run_code', (data) => {
    const currentLimit = userLimits.get(userIp) || { runsLeft: MAX_RUNS, resetTime: null };
    const currentTime = Date.now();

    // Kiểm tra reset thời gian 3 phút
    if (currentLimit.resetTime && currentTime >= currentLimit.resetTime) {
      currentLimit.runsLeft = MAX_RUNS;
      currentLimit.resetTime = null;
    }

    // Kiểm tra nếu hết lượt
    if (currentLimit.runsLeft <= 0) {
      const remainingSeconds = Math.ceil((currentLimit.resetTime - currentTime) / 1000);
      socket.emit('output', { 
        type: 'stderr', 
        data: `\n[Cảnh Báo Hạn Ngạch]: Bạn đã dùng hết 30 lượt chạy. Vui lòng chờ ${remainingSeconds} giây nữa để hệ thống cấp 30 lượt mới.\n` 
      });
      socket.emit('rate_limit_exceeded', { remainingSeconds });
      socket.emit('process_exit', { code: 429 });
      return;
    }

    // Trừ lượt dùng và cập nhật thời gian reset
    currentLimit.runsLeft--;
    if (currentLimit.runsLeft === 0 && !currentLimit.resetTime) {
      currentLimit.resetTime = currentTime + COOLDOWN_TIME;
    }

    // Lưu vào file local và phản hồi cho client
    userLimits.set(userIp, currentLimit);
    saveUserLimits(userLimits);

    socket.emit('rate_update', { 
      runsLeft: currentLimit.runsLeft, 
      resetTime: currentLimit.resetTime,
      maxRuns: MAX_RUNS
    });

    // Nếu đang có tiến trình cũ chưa xong thì kill
    if (processes.has(socket.id)) {
      clearTimeout(processes.get(socket.id).timer);
      clearTimeout(processes.get(socket.id).killTimer);
      processes.get(socket.id).proc.kill();
    }

    // Nhận dữ liệu code và files phụ từ client
    const { mainCode, files } = typeof data === 'string' ? { mainCode: data, files: [] } : data;

    // Ghi các file đính kèm
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

    // Thực thi Python
    const pythonProcess = spawn('python3', ['-u', 'main.py'], { cwd: sessionDir });

    // Timer cảnh báo Timeout 1 phút (60 giây) theo tài liệu v1.2
    const timer = setTimeout(() => {
      socket.emit('output', { 
        type: 'stderr', 
        data: '\n[CẢNH BÁO TIMEOUT]: Tiến trình đã thực thi hơn 1 phút (60s)...\n' 
      });
    }, EXECUTION_TIMEOUT);

    // Timer ngắt cứng hoàn toàn tiến trình ở mốc 10 phút (600 giây)
    const killTimer = setTimeout(() => {
      if (processes.has(socket.id)) {
        pythonProcess.kill();
        socket.emit('output', { 
          type: 'stderr', 
          data: '\n[HỆ THỐNG]: Đã chạm mốc 10 phút. Tự động ngắt tiến trình để bảo vệ tài nguyên máy chủ!\n' 
        });
        socket.emit('process_exit', { code: 124 });
        processes.delete(socket.id);
      }
    }, SHUTDOWN_LIMIT);

    processes.set(socket.id, { proc: pythonProcess, timer, killTimer });

    pythonProcess.stdout.on('data', (data) => {
      socket.emit('output', { type: 'stdout', data: data.toString('utf-8') });
    });

    pythonProcess.stderr.on('data', (data) => {
      socket.emit('output', { type: 'stderr', data: data.toString('utf-8') });
    });

    pythonProcess.on('close', (exitCode) => {
      if (processes.has(socket.id)) {
        clearTimeout(processes.get(socket.id).timer);
        clearTimeout(processes.get(socket.id).killTimer);
        processes.delete(socket.id);
      }

      // Xuất file text, JSON & Biểu đồ Matplotlib (.png, .jpg)
      try {
        const createdFiles = fs.readdirSync(sessionDir);
        const outputFiles = [];
        const charts = [];

        createdFiles.forEach(file => {
          const fullPath = path.join(sessionDir, file);
          const ext = path.extname(file).toLowerCase();

          if (ext === '.txt' || ext === '.json') {
            const content = fs.readFileSync(fullPath, 'utf-8');
            outputFiles.push({ name: file, content });
          }

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
        clearTimeout(processes.get(socket.id).killTimer);
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
      clearTimeout(processes.get(socket.id).killTimer);
      processes.get(socket.id).proc.kill();
      processes.delete(socket.id);
    }
    cleanupDirectory(sessionDir);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`=== AlPytide API Engine Container v1.2.0 running on port ${PORT} ===`);
});
