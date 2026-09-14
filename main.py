import io
import multiprocessing
import sys
import traceback
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

app = FastAPI(
    title="Alpytide Python Engine",
    description="Backend API nâng cao xử lý và thực thi code Python",
    version="2.0.0",
)

# 1. Bật CORS để cho phép Frontend gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CodeRequest(BaseModel):
    code: str


# Hàm chạy code trong Process riêng lẻ để kiểm soát Timeout
def run_code_worker(code: str, queue: multiprocessing.Queue):
    buffer = io.StringIO()
    sys.stdout = buffer
    sys.stderr = buffer

    # Môi trường cách ly cơ bản (Sandbox)
    safe_globals = {
        "__builtins__": __builtins__,
    }

    # Bỏ hoặc giới hạn một số hàm/module nguy hiểm nếu muốn
    # del safe_globals['__builtins__']['eval']

    try:
        exec(code, safe_globals)
        output = buffer.getvalue()
        queue.put({"success": True, "output": output})
    except Exception:
        # Bắt chi tiết lỗi SyntaxError, NameError, Exception...
        error_msg = traceback.format_exc()
        queue.put({"success": False, "output": error_msg})


# 2. ROUTE GET / TRẢ VỀ TRANG TÀI LIỆU HTML
@app.get("/", response_class=HTMLResponse)
async def get_documentation():
    try:
        # Đọc trực tiếp file index.html nằm cùng thư mục
        with open("index.html", "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return """
        <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h2 style="color: #0284c7;">Alpytide Engine Status: ONLINE 🚀</h2>
                <p>Không tìm thấy file <b>index.html</b> trong thư mục root. Vui lòng tạo file index.html để hiển thị giao diện tài liệu.</p>
            </body>
        </html>
        """


# 3. ROUTE GET /api ĐỂ PING CHECK (CẦN CHO ALPYTIDE.INIT)
@app.get("/api")
async def ping_check():
    return {
        "status": "online",
        "engine": "Alpytide Advanced Python Runner",
        "version": "2.0.0",
        "message": "Alpytide Engine Ready",
    }


# 4. ROUTE POST /api THỰC THI CODE PYTHON NÂNG CAO (TIMEOUT 5S)
@app.post("/api")
async def execute_code(request: CodeRequest):
    code = request.code.strip()

    if not code:
        return {"output": "⚠️ Lỗi: Đoạn mã trống!"}

    queue = multiprocessing.Queue()
    process = multiprocessing.Process(
        target=run_code_worker, args=(code, queue)
    )

    process.start()

    # Giới hạn thời gian chạy tối đa là 5 giây (tránh while True gây treo server)
    process.join(timeout=5)

    if process.is_alive():
        process.terminate()
        process.join()
        return {
            "output": "❌ Lỗi: Thời gian thực thi vượt quá 5 giây (Timeout / Vòng lặp vô tận)!"
        }

    if not queue.empty():
        result = queue.get()
        return {"output": result["output"]}

    return {"output": "❌ Lỗi hệ thống: Không nhận được phản hồi từ Engine."}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0", port=8000, reload=True)
