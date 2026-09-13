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

// ROUTE GIAO DIỆN CHÍNH (Tối ưu ngắt dòng Soft-Wrap như Programiz)
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AlPytide Python IDE v1.2</title>
  
  <!-- Bootstrap 5 & FontAwesome -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  
  <!-- CodeMirror 5 -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/codemirror.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/theme/dracula.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/codemirror.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/mode/python/python.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/closebrackets.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/matchbrackets.min.js"></script>

  <!-- Socket.io -->
  <script src="/socket.io/socket.io.js"></script>

  <style>
    :root {
      --bg-color: #181824;
      --card-bg: #21222c;
      --border-color: #343746;
      --text-main: #f8f8f2;
    }
    body {
      background-color: var(--bg-color);
      color: var(--text-main);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      min-height: 100vh;
      margin: 0;
    }
    .navbar-custom {
      background-color: var(--card-bg);
      border-bottom: 1px solid var(--border-color);
      padding: 10px 20px;
    }
    .editor-container, .console-container {
      background-color: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 15px;
    }
    .CodeMirror {
      height: 400px;
      border-radius: 6px;
      font-family: 'Fira Code', 'Consolas', 'Courier New', monospace;
      font-size: 14px;
      line-height: 1.5;
    }
    /* Sửa lỗi tràn màn hình: Tự động xuống dòng chuẩn như Programiz */
    .CodeMirror-wrap pre.CodeMirror-line, 
    .CodeMirror-wrap pre.CodeMirror-line-like {
      word-break: break-word;
    }
    .CodeMirror-gutters {
      background-color: #282a36;
      border-right: 1px solid var(--border-color);
    }
    .console-output {
      width: 100%;
      height: 350px;
      background-color: #11121d;
      color: #50fa7b;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 12px;
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 13.5px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .output-stderr { color: #ff5555; }
    .output-stdout { color: #50fa7b; }
    .output-info { color: #8be9fd; }
    .chart-preview-img {
      max-width: 100%;
      border-radius: 8px;
      border: 1px solid var(--border-color);
      margin-top: 10px;
    }
    .warning-banner {
      background-color: #ffb86c22;
      border: 1px solid #ffb86c;
      color: #ffb86c;
      font-size: 12px;
      padding: 6px 12px;
      border-radius: 6px;
      display: none;
    }
  </style>
</head>
<body>

  <nav class="navbar-custom d-flex justify-content-between align-items-center">
    <div class="d-flex align-items-center gap-2">
      <span class="fw-bold fs-5 text-white"><i class="fa-brands fa-python text-warning me-2"></i>AlPytide Web IDE</span>
      <span class="badge bg-primary rounded-pill">v1.2</span>
    </div>
    <div id="serverStatus" class="badge bg-secondary"><i class="fa-solid fa-signal me-1"></i> Đang kết nối...</div>
  </nav>

  <div class="container-fluid my-3 px-3">
    <!-- THANH HẠN NGẠCH -->
    <div class="row mb-3">
      <div class="col-12">
        <div class="p-3 rounded border" style="background-color: var(--card-bg); border-color: var(--border-color) !important;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="small fw-bold text-white"><i class="fa-solid fa-gauge-high text-warning me-1"></i> Hạn Ngạch Thực Thi (30 Lượt / 3 Phút)</span>
            <span id="cooldownLabel" class="small text-danger fw-bold">Sẵn sàng</span>
          </div>
          <div class="progress" style="height: 12px;">
            <div id="quotaBar" class="progress-bar bg-success" role="progressbar" style="width: 100%;">30 / 30 Lượt</div>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <!-- CỘT EDIT CODE -->
      <div class="col-lg-7">
        <div class="editor-container">
          <div class="d-flex flex-wrap gap-2 mb-2">
            <button id="btnRun" class="btn btn-success btn-sm px-3" onclick="runCode()">
              <i class="fa-solid fa-play me-1"></i> Run Code
            </button>
            <button class="btn btn-primary btn-sm" onclick="copyCode()"><i class="fa-regular fa-copy me-1"></i> Sao Chép</button>
            <button class="btn btn-warning btn-sm text-dark" onclick="cutCode()"><i class="fa-solid fa-scissors me-1"></i> Cắt Code</button>
            <button class="btn btn-danger btn-sm" onclick="clearCode()"><i class="fa-solid fa-trash me-1"></i> Xóa Code</button>
            <button class="btn btn-secondary btn-sm ms-auto" onclick="clearConsole()"><i class="fa-solid fa-eraser me-1"></i> Xóa Console</button>
          </div>

          <!-- CẢNH BÁO DÒNG/CÚ PHÁP -->
          <div id="warningBanner" class="warning-banner mb-2">
            <i class="fa-solid fa-triangle-exclamation me-1"></i> <span id="warningMsg"></span>
          </div>

          <!-- KHUNG CODE MIRROR -->
          <textarea id="codeEditor"></textarea>
        </div>
      </div>

      <!-- CỘT CONSOLE OUTPUT -->
      <div class="col-lg-5">
        <div class="console-container">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="fw-bold text-white"><i class="fa-solid fa-terminal me-2"></i>Console Output</span>
            <span id="executionTimer" class="small text-secondary">0.0s</span>
          </div>

          <div id="consoleOutput" class="console-output"></div>

          <div id="chartContainer" class="mt-2 text-center" style="display: none;">
            <hr class="border-secondary my-2">
            <span class="small text-info fw-bold"><i class="fa-solid fa-chart-line me-1"></i>Biểu Đồ Xuất Bản:</span>
            <div id="chartList"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let socket;
    let editor;
    let runsLeft = 30;
    let resetTime = null;
    let timerInterval = null;

    // Khởi tạo CodeMirror IDE đã khắc phục lỗi tự động lùi tab & tràn lề
    window.onload = () => {
      editor = CodeMirror.fromTextArea(document.getElementById('codeEditor'), {
        mode: 'python',
        theme: 'dracula',
        lineNumbers: true,
        lineWrapping: true,        // Tự động xuống dòng khi câu lệnh vượt màn hình
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        smartIndent: false,        // Tắt tự động lùi tab nhầm khi bấm Enter ở dòng thường
        electricChars: false,
        matchBrackets: true,
        autoCloseBrackets: true
      });

      // Lấy code cũ từ LocalStorage
      const savedCode = localStorage.getItem('alpytide_code_backup');
      if (savedCode) {
        editor.setValue(savedCode);
      } else {
        editor.setValue(\`# Mã Python mẫu với AlPytide Engine
import time

print("Hello AlPytide Sandbox!")
for i in range(1, 4):
    print(f"-> Đang thực thi bước {i}...")\`);
      }

      // Kiểm tra và tự động cảnh báo dòng/cú pháp
      editor.on('change', () => {
        const code = editor.getValue();
        localStorage.setItem('alpytide_code_backup', code);
        checkCodeWarnings(code);
      });

      initSocket();
    };

    function checkCodeWarnings(code) {
      const banner = document.getElementById('warningBanner');
      const msg = document.getElementById('warningMsg');
      const lines = code.split('\\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().endsWith(':') && i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          if (nextLine.trim() !== '' && !nextLine.startsWith(' ') && !nextLine.startsWith('\\t')) {
            msg.innerText = \`Cảnh báo dòng \${i + 2}: Thiếu thụt lề (IndentationError) sau câu lệnh ở dòng \${i + 1}.\`;
            banner.style.display = 'block';
            return;
          }
        }
      }
      banner.style.display = 'none';
    }

    function initSocket() {
      socket = io();

      socket.on('connect', () => {
        document.getElementById('serverStatus').className = "badge bg-success";
        document.getElementById('serverStatus').innerHTML = \`<i class="fa-solid fa-circle-check me-1"></i> Server Online\`;
        appendConsole("System", "Kết nối máy chủ thành công! Cài đặt sẵn sàng.\\n", "info");
      });

      socket.on('disconnect', () => {
        document.getElementById('serverStatus').className = "badge bg-danger";
        document.getElementById('serverStatus').innerHTML = \`<i class="fa-solid fa-circle-xmark me-1"></i> Mất kết nối\`;
      });

      socket.on('rate_update', (data) => {
        runsLeft = data.runsLeft;
        resetTime = data.resetTime;
        updateQuotaUI();
      });

      socket.on('output', (data) => {
        appendConsole("Python", data.data, data.type);
      });

      socket.on('charts_generated', (charts) => {
        const chartContainer = document.getElementById('chartContainer');
        const chartList = document.getElementById('chartList');
        chartList.innerHTML = '';
        charts.forEach(chart => {
          const img = document.createElement('img');
          img.src = chart.data;
          img.className = 'chart-preview-img';
          chartList.appendChild(img);
        });
        chartContainer.style.display = 'block';
      });

      socket.on('process_exit', (data) => {
        clearInterval(timerInterval);
        document.getElementById('btnRun').disabled = false;
        document.getElementById('btnRun').innerHTML = \`<i class="fa-solid fa-play me-1"></i> Run Code\`;
        appendConsole("System", \`\\n[Tiến trình kết thúc với mã Exit: \${data.code}]\\n\`, "info");
      });
    }

    function runCode() {
      const code = editor.getValue().trim();
      if (!code) return alert("Vui lòng nhập code Python!");
      if (runsLeft <= 0) return alert("Bạn đã hết 30 lượt dùng! Hãy chờ reset.");

      document.getElementById('btnRun').disabled = true;
      document.getElementById('btnRun').innerHTML = \`<i class="fa-solid fa-spinner fa-spin me-1"></i> Đang chạy...\`;
      clearConsole();

      let startTime = Date.now();
      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        document.getElementById('executionTimer').innerText = \`\${((Date.now() - startTime) / 1000).toFixed(1)}s\`;
      }, 100);

      socket.emit('run_code', { mainCode: code, files: [] });
    }

    function copyCode() {
      navigator.clipboard.writeText(editor.getValue());
      alert("Đã sao chép code vào bộ nhớ tạm!");
    }

    function cutCode() {
      navigator.clipboard.writeText(editor.getValue());
      editor.setValue('');
      alert("Đã cắt toàn bộ đoạn mã!");
    }

    function clearCode() {
      if (confirm("Xóa toàn bộ mã nguồn?")) editor.setValue('');
    }

    function clearConsole() {
      document.getElementById('consoleOutput').innerHTML = '';
      document.getElementById('chartContainer').style.display = 'none';
    }

    function appendConsole(source, text, type) {
      const consoleBox = document.getElementById('consoleOutput');
      const span = document.createElement('span');
      span.className = \`output-\${type}\`;
      span.innerText = text;
      consoleBox.appendChild(span);
      consoleBox.scrollTop = consoleBox.scrollHeight;
    }

    function updateQuotaUI() {
      const progressBar = document.getElementById('quotaBar');
      const cooldownLabel = document.getElementById('cooldownLabel');
      const percent = Math.max(0, Math.min(100, (runsLeft / 30) * 100));
      
      progressBar.style.width = \`\${percent}%\`;
      progressBar.innerText = \`\${runsLeft} / 30 Lượt\`;

      if (resetTime && Date.now() < parseInt(resetTime)) {
        const remainingSec = Math.ceil((parseInt(resetTime) - Date.now()) / 1000);
        cooldownLabel.innerText = \`Reset sau \${remainingSec}s\`;
      } else {
        cooldownLabel.innerText = "Sẵn sàng";
      }
    }

    setInterval(() => {
      if (resetTime && Date.now() >= parseInt(resetTime)) {
        runsLeft = 30;
        resetTime = null;
      }
      updateQuotaUI();
    }, 1000);
  </script>
</body>
</html>
  `);
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

  // Kiểm tra thời gian cooldown reset lượt
  if (limitInfo.resetTime && now >= limitInfo.resetTime) {
    limitInfo.runsLeft = MAX_RUNS;
    limitInfo.resetTime = null;
    saveUserLimits(userLimits);
  }

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

    if (currentLimit.resetTime && currentTime >= currentLimit.resetTime) {
      currentLimit.runsLeft = MAX_RUNS;
      currentLimit.resetTime = null;
    }

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

    currentLimit.runsLeft--;
    if (currentLimit.runsLeft === 0 && !currentLimit.resetTime) {
      currentLimit.resetTime = currentTime + COOLDOWN_TIME;
    }

    userLimits.set(userIp, currentLimit);
    saveUserLimits(userLimits);

    socket.emit('rate_update', { 
      runsLeft: currentLimit.runsLeft, 
      resetTime: currentLimit.resetTime,
      maxRuns: MAX_RUNS
    });

    if (processes.has(socket.id)) {
      clearTimeout(processes.get(socket.id).timer);
      clearTimeout(processes.get(socket.id).killTimer);
      processes.get(socket.id).proc.kill();
    }

    const { mainCode, files } = typeof data === 'string' ? { mainCode: data, files: [] } : data;

    if (Array.isArray(files)) {
      files.forEach(file => {
        if (file.name && file.content !== undefined) {
          const filePath = path.join(sessionDir, file.name);
          fs.writeFileSync(filePath, file.content, 'utf-8');
        }
      });
    }

    const mainFilePath = path.join(sessionDir, 'main.py');
    let formattedCode = (mainCode || '').replace(/\r\n/g, '\n').replace(/\t/g, '    ');
    fs.writeFileSync(mainFilePath, formattedCode, 'utf-8');

    const pythonProcess = spawn('python3', ['-u', 'main.py'], { cwd: sessionDir });

    const timer = setTimeout(() => {
      socket.emit('output', { 
        type: 'stderr', 
        data: '\n[CẢNH BÁO TIMEOUT]: Tiến trình đã thực thi hơn 1 phút (60s)...\n' 
      });
    }, EXECUTION_TIMEOUT);

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
