const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoint kiểm tra trạng thái Engine
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    engine: 'AlPytide Python Engine (Docker)',
    version: '1.0.0',
    timeout_limit: '15 seconds'
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const processes = new Map();
const EXECUTION_TIMEOUT = 15000; // Giới hạn 15 giây chống quá tải Container

io.on('connection', (socket) => {
  socket.on('run_code', (code) => {
    // Nếu client đang có tiến trình cũ chưa xong thì dọn dẹp trước
    if (processes.has(socket.id)) {
      clearTimeout(processes.get(socket.id).timer);
      processes.get(socket.id).proc.kill();
    }

    // Chuẩn hóa Tab (4 space) và ký tự xuống dòng
    let formattedCode = code.replace(/\r\n/g, '\n').replace(/\t/g, '    ');

    // Chạy Python bằng lệnh trong Docker container
    const pythonProcess = spawn('python3', ['-u', '-c', formattedCode]);

    // Đếm ngược Timeout phòng trường hợp code dính vòng lặp vô tận
    const timer = setTimeout(() => {
      if (processes.has(socket.id)) {
        pythonProcess.kill();
        socket.emit('output', { type: 'stderr', data: '\n[Lỗi: Thời gian thực thi vượt quá giới hạn 15s]\n' });
        socket.emit('process_exit', { code: 124 });
        processes.delete(socket.id);
      }
    }, EXECUTION_TIMEOUT);

    processes.set(socket.id, { proc: pythonProcess, timer });

    // Đẩy dữ liệu Realtime stdout
    pythonProcess.stdout.on('data', (data) => {
      socket.emit('output', { type: 'stdout', data: data.toString('utf-8') });
    });

    // Đẩy dữ liệu Realtime stderr
    pythonProcess.stderr.on('data', (data) => {
      socket.emit('output', { type: 'stderr', data: data.toString('utf-8') });
    });

    // Khi tiến trình kết thúc
    pythonProcess.on('close', (exitCode) => {
      if (processes.has(socket.id)) {
        clearTimeout(processes.get(socket.id).timer);
        processes.delete(socket.id);
      }
      socket.emit('process_exit', { code: exitCode });
    });

    // Xử lý khi xảy ra lỗi tiến trình
    pythonProcess.on('error', (err) => {
      socket.emit('output', { type: 'stderr', data: `Lỗi Container: ${err.message}\n` });
      if (processes.has(socket.id)) {
        clearTimeout(processes.get(socket.id).timer);
        processes.delete(socket.id);
      }
      socket.emit('process_exit', { code: 1 });
    });
  });

  // Nhận dữ liệu nhập từ giao diện (stdin)
  socket.on('input_data', (data) => {
    const processData = processes.get(socket.id);
    if (processData && processData.proc.stdin.writable) {
      processData.proc.stdin.write(data + '\n');
    }
  });

  // Khi ngắt kết nối thì ngắt luôn tiến trình Python tương ứng
  socket.on('disconnect', () => {
    if (processes.has(socket.id)) {
      clearTimeout(processes.get(socket.id).timer);
      processes.get(socket.id).proc.kill();
      processes.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`=== AlPytide API Engine Container running on port ${PORT} ===`);
});
