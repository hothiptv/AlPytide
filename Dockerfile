FROM node:18-slim

# Cài đặt Python3, pip và các thư viện Python hỗ trợ cho Engine
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt-lists/*
RUN pip3 install --no-cache-dir colorama requests

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
