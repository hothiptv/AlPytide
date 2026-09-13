const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// Quản lý các tiến trình Python theo Socket ID
const processes = new Map();

io.on('connection', (socket) => {
    // 1. Nhận lệnh chạy code từ giao diện
    socket.on('run_code', (code) => {
        // Nếu có tiến trình cũ đang chạy, hãy diệt nó trước
        if (processes.has(socket.id)) {
            processes.get(socket.id).kill();
        }

        // Chạy Python ở chế độ Unbuffered (-u) để đẩy output realtime
        const pythonProcess = spawn('python3', ['-u', '-c', code]);
        processes.set(socket.id, pythonProcess);

        // Đẩy luồng dữ liệu xuất (stdout) về Frontend
        pythonProcess.stdout.on('data', (data) => {
            socket.emit('output', { type: 'stdout', data: data.toString('utf-8') });
        });

        // Đẩy luồng báo lỗi (stderr) về Frontend
        pythonProcess.stderr.on('data', (data) => {
            socket.emit('output', { type: 'stderr', data: data.toString('utf-8') });
        });

        // Khi chương trình kết thúc
        pythonProcess.on('close', (code) => {
            processes.delete(socket.id);
            socket.emit('process_exit', { code });
        });

        pythonProcess.on('error', (err) => {
            socket.emit('output', { type: 'stderr', data: `Lỗi Server: ${err.message}\n` });
            processes.delete(socket.id);
            socket.emit('process_exit', { code: 1 });
        });
    });

    // 2. Nhận dữ liệu nhập từ giao diện (Input) và truyền vào STDIN của Python
    socket.on('input_data', (data) => {
        const pythonProcess = processes.get(socket.id);
        if (pythonProcess && pythonProcess.stdin.writable) {
            pythonProcess.stdin.write(data + '\n');
        }
    });

    // Ngắt tiến trình khi đóng kết nối
    socket.on('disconnect', () => {
        if (processes.has(socket.id)) {
            processes.get(socket.id).kill();
            processes.delete(socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server AlPytide đang chạy tại port ${PORT}`);
});
