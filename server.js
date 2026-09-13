const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Endpoint API chính
app.get('/api', (req, res) => {
  res.json({
    name: "AlPytide API",
    version: "1.0.0",
    status: "running",
    engine: "Pyodide (WebAssembly)",
    docs: "/docs"
  });
});

// Trang tài liệu Docs
app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'docs.html'));
});

// Route mặc định
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`AlPytide API server is running on port ${PORT}`);
});
