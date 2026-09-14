from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sys
import io

app = FastAPI()

# 1. Bật CORS để cho phép HTML chạy từ localhost/mọi trang web gọi tới API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CodeRequest(BaseModel):
    code: str

# 2. BẮT BUỘC THÊM ROUTE GET /api ĐỂ ALPYTIDE.INIT() PING KẾT NỐI
@app.get("/api")
async def ping_check():
    return {"status": "online", "message": "Alpytide Engine Ready"}

# 3. Route POST /api thực thi code Python
@app.post("/api")
async def execute_code(request: CodeRequest):
    old_stdout = sys.stdout
    redirected_output = io.StringIO()
    sys.stdout = redirected_output
    
    try:
        exec(request.code, {})
        output = redirected_output.getvalue()
    except Exception as e:
        output = str(e)
    finally:
        sys.stdout = old_stdout
        
    return {"output": output}
