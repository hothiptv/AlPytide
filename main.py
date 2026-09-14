import io
import sys
import os
import subprocess
import traceback
from typing import Dict, Any
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

app = FastAPI(title="Python API", docs_url=None, redoc_url=None)

# Cho phép HTML từ mọi nơi gọi API mà không bị chặn CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Xác định đường dẫn tuyệt đối tới thư mục templates
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates_dir = os.path.join(BASE_DIR, "templates")
templates = Jinja2Templates(directory=templates_dir)

class CodeExecutionRequest(BaseModel):
    code: str

def auto_install_and_import(package_name: str):
    """Tự động pip install nếu thiếu thư viện"""
    try:
        __import__(package_name)
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", package_name])

# Tự động chuyển hướng từ trang chủ "/" sang "/docs"
@app.get("/", response_class=RedirectResponse)
async def redirect_to_docs():
    return "/docs"

@app.get("/docs", response_class=HTMLResponse)
async def get_docs(request: Request):
    """Giao diện Tài liệu sử dụng Bootstrap standard"""
    return templates.TemplateResponse("docs.html", {"request": request})

@app.post("/api")
async def execute_python_code(data: CodeExecutionRequest) -> Dict[str, Any]:
    """API Nhận và Xử lý Python Code"""
    code = data.code
    
    # Bắt luồng stdout và stderr
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    redirected_output = io.StringIO()
    redirected_error = io.StringIO()
    
    sys.stdout = redirected_output
    sys.stderr = redirected_error
    
    global_vars = {
        "__name__": "__main__",
        "auto_install": auto_install_and_import
    }
    
    status = "success"
    error_message = None

    try:
        # Thực thi code Python
        exec(code, global_vars)
    except Exception as e:
        status = "error"
        error_message = traceback.format_exc()
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

    output_str = redirected_output.getvalue()
    error_str = redirected_error.getvalue()

    return {
        "status": status,
        "output": output_str if status == "success" else "",
        "error": error_message or error_str
    }
