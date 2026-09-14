import io
import sys
import traceback
import multiprocessing
import math
import json
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    import pandas as pd
    import numpy as np
except ImportError:
    pd = None
    np = None

app = FastAPI(
    title="AlPytide Python Engine",
    version="2.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CodeRequest(BaseModel):
    code: str = Field(..., description="Mã nguồn Python cần thực thi")
    inputs: Optional[List[str]] = Field(default=[], description="Danh sách dữ liệu nhập cho các lệnh input()")


# Wrapper giả lập input() chuẩn terminal
def create_custom_input(inputs_list, buffer):
    input_idx = 0

    def custom_input(prompt=""):
        nonlocal input_idx
        # In prompt ra stdout
        if prompt:
            buffer.write(str(prompt))
        
        # Lấy giá trị tương ứng từ danh sách
        val = ""
        if input_idx < len(inputs_list):
            val = str(inputs_list[input_idx])
            input_idx += 1
            
        # In giá trị người dùng gõ kèm xuống dòng
        buffer.write(val + "\n")
        return val

    return custom_input


def run_code_worker(code: str, inputs: list, queue: multiprocessing.Queue):
    buffer = io.StringIO()
    sys.stdout = buffer
    sys.stderr = buffer

    safe_globals = {
        "__builtins__": __builtins__,
        "math": math,
        "json": json,
        "datetime": datetime,
    }
    
    # Override hàm input bằng custom_input
    safe_globals["input"] = create_custom_input(inputs, buffer)

    if pd is not None:
        safe_globals["pd"] = pd
    if np is not None:
        safe_globals["np"] = np

    try:
        exec(code, safe_globals)
        output = buffer.getvalue()
        
        if not output.strip():
            output = "[Execution completed with no output]"
            
        queue.put({"success": True, "output": output})
    except Exception:
        error_msg = traceback.format_exc()
        queue.put({"success": False, "output": error_msg})
    finally:
        buffer.close()


@app.get("/")
async def root():
    return {"status": "online", "version": "2.3.0"}


@app.post("/api")
async def execute_code(request: CodeRequest):
    code = request.code.strip()
    if not code:
        return {"output": "⚠️ Lỗi: Đoạn mã trống!"}

    queue = multiprocessing.Queue()
    process = multiprocessing.Process(
        target=run_code_worker, 
        args=(code, request.inputs or [], queue)
    )

    process.start()
    process.join(timeout=5.0)

    if process.is_alive():
        process.terminate()
        process.join()
        return {"output": "❌ Lỗi: Thời gian thực thi vượt quá 5 giây!"}

    output_result = "❌ Lỗi hệ thống từ Engine."
    if not queue.empty():
        result = queue.get()
        output_result = result.get("output", "")

    queue.close()
    queue.join_thread()

    return {"output": output_result}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=10000, reload=True)
