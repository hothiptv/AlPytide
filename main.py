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
    description="Backend API xử lý và thực thi code Python cho AlPyedit",
    version="2.0.0",
)

# 1. Bật CORS cho phép giao diện gọi API từ bất kỳ tên miền nào
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CodeRequest(BaseModel):
    code: str


# Process riêng lẻ để thực thi code và kiểm soát Timeout
def run_code_worker(code: str, queue: multiprocessing.Queue):
    buffer = io.StringIO()
    sys.stdout = buffer
    sys.stderr = buffer

    safe_globals = {
        "__builtins__": __builtins__,
    }

    try:
        exec(code, safe_globals)
        output = buffer.getvalue()
        queue.put({"success": True, "output": output})
    except Exception:
        error_msg = traceback.format_exc()
        queue.put({"success": False, "output": error_msg})


# 2. ROUTE GET / TRẢ VỀ FILE TEMPLATES/DOCS.HTML
@app.get("/", response_class=HTMLResponse)
async def get_documentation():
    try:
        # Đọc trực tiếp tệp docs.html trong thư mục templates
        with open("templates/docs.html", "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return """
        <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h2 style="color: #0284c7;">Alpytide Engine Status: ONLINE 🚀</h2>
                <p>Không tìm thấy tệp <b>templates/docs.html</b> trên Server!</p>
            </body>
        </html>
        """


# 3. ROUTE GET /api ĐỂ PING CHECK (ALPYTIDE.INIT KẾT NỐI)
@app.get("/api")
async def ping_check():
    return {
        "status": "online",
        "engine": "Alpytide Advanced Python Runner",
        "version": "2.0.0",
        "message": "Alpytide Engine Ready",
    }


# 4. ROUTE POST /api THỰC THI CODE PYTHON (GIỚI HẠN 5S RUNTIME)
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

    # Tự động hủy nếu code chạy quá 5 giây (chống lặp vô tận)
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

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
