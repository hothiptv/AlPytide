FROM python:3.12-slim

# Cài đặt toàn bộ công cụ hệ thống, trình biên dịch C/C++ và các thư viện phát triển (headers)
# để build trơn tru mọi thư viện Python (numpy, pandas, pillow, matplotlib, psycopg2, v.v.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    gfortran \
    libpq-dev \
    libffi-dev \
    libssl-dev \
    libjpeg-dev \
    zlib1g-dev \
    libfreetype6-dev \
    libpng-dev \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Nâng cấp pip, setuptools và wheel lên phiên bản mới nhất để hỗ trợ build wheel mượt mà hơn
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 10000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]
