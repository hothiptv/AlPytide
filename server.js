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

const processes = new Map();

io.on('connection', (socket) => {
    socket.on('run_code', (code) => {
        if (processes.has(socket.id)) {
            processes.get(socket.id).kill();
        }

        const pythonProcess = spawn('python3', ['-u', '-c', code]);
        processes.set(socket.id, pythonProcess);

        pythonProcess.stdout.on('data', (data) => {
            socket.emit('output', { type: 'stdout', data: data.toString('utf-8') });
        });

        pythonProcess.stderr.on('data', (data) => {
            socket.emit('output', { type: 'stderr', data: data.toString('utf-8') });
        });

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
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server AlPytide đang chạy tại port ${PORT}`);
});
