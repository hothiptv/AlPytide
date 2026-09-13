FROM python:3.10-slim

# Cài đặt Node.js và các công cụ hệ thống
RUN apt-get update && apt-get install -y curl build-essential && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

WORKDIR /app

# Cài trước các thư viện Python phổ biến cho IDE
RUN pip install --no-cache-dir requests urllib3 numpy pandas beautifulsoup4

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 10000

CMD ["npm", "start"]
