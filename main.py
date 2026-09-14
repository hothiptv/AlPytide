import io
import sys
import traceback
import multiprocessing
import math
import json
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
try:
    import pandas as pd
    import numpy as np
except ImportError:
    pd = None
    np = None

app = FastAPI(
    title="AlPytide Python Engine",
    description="Backend API xử lý và thực thi code Python nâng cao cho AlPytide Mobile IDE",
    version="2.1.0",
)

# 1. Bật CORS toàn diện cho phép mọi client gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from pydantic import BaseModel, Field

class CodeRequest(BaseModel):
    code: str = Field(..., description="Đoạn mã Python cần thực thi")


# Worker chạy trong tiến trình độc lập để cô lập môi trường và kiểm soát timeout
def run_code_worker(code: str, queue: multiprocessing.Queue):
    # Chặn việc gọi input() trực tiếp trên server backend để tránh bị treo luồng
    if "input(" in code:
        queue.put({
            "success": False, 
            "output": "❌ Lỗi: Hàm input() trực tiếp không được hỗ trợ trên server backend API. Vui lòng gán sẵn giá trị biến."
        })
        return

    buffer = io.StringIO()
    sys.stdout = buffer
    sys.stderr = buffer

    # Môi trường global an toàn, tích hợp sẵn các thư viện phân tích dữ liệu phổ biến
    safe_globals = {
        "__builtins__": __builtins__,
        "math": math,
        "json": json,
        "datetime": datetime,
    }
    
    if pd is not None:
        safe_globals["pd"] = pd
    if np is not None:
        safe_globals["np"] = np

    try:
        # Thực thi đoạn mã code Python của người dùng
        exec(code, safe_globals)
        output = buffer.getvalue()
        
        # Nếu code chạy xong mà không có print gì thì trả về thông báo hoàn thành nhẹ nhàng
        if not output.strip():
            output = "[Execution completed with no output]"
            
        queue.put({"success": True, "output": output})
    except Exception:
        error_msg = traceback.format_exc()
        queue.put({"success": False, "output": error_msg})
    finally:
        buffer.close()


# 2. ROUTE GET / TRẢ VỀ FILE TEMPLATES/DOCS.HTML HOẶC GIAO DIỆN MẶC ĐỊNH
@app.get("/", response_class=HTMLResponse)
async def get_documentation():
    try:
        with open("templates/docs.html", "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return """
        <html>
            <head><title>AlPytide Engine</title></head>
            <body style="font-family: monospace; background: #18181b; color: #f4f4f5; text-align: center; padding: 50px;">
                <h2 style="color: #10b981;">AlPytide Python Engine: ONLINE 🚀</h2>
                <p>Server đang hoạt động bình thường! Không tìm thấy tệp <b>templates/docs.html</b>.</p>
            </body>
        </html>
        """


# 3. ROUTE GET /api ĐỂ PING CHECK TRẠNG THÁI SERVER
@app.get("/api")
async def ping_check():
    return {
        "status": "online",
        "engine": "AlPytide Advanced Python Runner",
        "version": "2.1.0",
        "message": "AlPytide Engine Ready",
    }


# 4. ROUTE POST /api THỰC THI CODE PYTHON (GIỚI HẠN TIMEOUT 5 GIÂY)
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

    # Chờ tối đa 5 giây để phòng chống vòng lặp vô tận (infinite loop)
    process.join(timeout=5.0)

    if process.is_alive():
        process.terminate()
        process.join()
        return {
            "output": "❌ Lỗi: Thời gian thực thi vượt quá giới hạn 5 giây (Timeout / Vòng lặp vô tận)!"
        }

    output_result = "❌ Lỗi hệ thống: Không nhận được phản hồi từ tiến trình thực thi."
    if not queue.empty():
        result = queue.get()
        output_result = result.get("output", "")

    # Dọn dẹp queue
    queue.close()
    queue.join_thread()

    return {"output": output_result}


if __name__ == "__main__":
    import uvicorn
    # Khởi động server trỏ đúng cổng 10000 tương thích với Dockerfile và Render
    uvicorn.run("main:app", host="0.0.0.0", port=10000, reload=True)
