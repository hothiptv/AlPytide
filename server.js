const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn, execSync } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors()); // Mở CORS để các web khác gọi vào API thoải mái
app.use(express.json());

// Tự động kiểm tra và cài đặt các thư viện Python cần thiết khi khởi động
const REQUIRED_MODULES = ['colorama', 'requests']; 
console.log('>[AlPytide API] Đang kiểm tra thư viện Python...');
REQUIRED_MODULES.forEach(mod => {
    try {
        require('child_process').execSync(`python3 -m pip install ${mod}`);
    } catch (e) {
        console.log(`> Không thể cài ${mod}, bỏ qua...`);
    }
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

// Endpoint API HTTP đơn giản cho các web khác kiểm tra trạng thái Server
app.get('/api/status', (req, res) => {
    res.json({ status: 'online', engine: 'AlPytide Python Engine', version: '1.0.0' });
});

const processes = new Map();

io.on('connection', (socket) => {
    console.log(`> Client kết nối API: ${socket.id}`);

    socket.on('run_code', (code) => {
        if (processes.has(socket.id)) {
            processes.get(socket.id).kill();
        }

        // 1. Sửa lỗi cú pháp dòng & Chuẩn hóa 1 Tab thành 4 space
        let formattedCode = code
            .replace(/\r\n/g, '\n')
            .replace(/\t/g, '    ');

        // 2. Chạy Python với tham số -u (Unbuffered) để đẩy dữ liệu realtime
        const pythonProcess = spawn('python3', ['-u', '-c', formattedCode]);
        processes.set(socket.id, pythonProcess);

        // Lắng nghe dữ liệu đầu ra (stdout)
        pythonProcess.stdout.on('data', (data) => {
            const outputText = data.toString('utf-8');
            socket.emit('output', { type: 'stdout', data: outputText });
        });

        // Lắng nghe báo lỗi (stderr)
        pythonProcess.stderr.on('data', (data) => {
            const errorText = data.toString('utf-8');
            socket.emit('output', { type: 'stderr', data: errorText });
        });

        pythonProcess.on('close', (code) => {
            processes.delete(socket.id);
            socket.emit('process_exit', { code });
        });

        pythonProcess.on('error', (err) => {
            socket.emit('output', { type: 'stderr', data: `Lỗi API Server: ${err.message}\n` });
            processes.delete(socket.id);
            socket.emit('process_exit', { code: 1 });
        });
    });

    // Nhận dữ liệu input từ người dùng truyền vào stdin của Python
    socket.on('input_data', (data) => {
        const pythonProcess = processes.get(socket.id);
        if (pythonProcess && pythonProcess.stdin.writable) {
            pythonProcess.stdin.write(data + '\n');
        }
    });

    socket.on('disconnect', () => {
        if (processes.has(socket.id)) {
            processes.get(socket.id).kill();
            processes.delete(socket.id);
        }
        console.log(`> Client ngắt kết nối: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`=== AlPytide API Server đang chạy tại port ${PORT} ===`);
});
