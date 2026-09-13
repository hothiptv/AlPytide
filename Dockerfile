FROM node:18-slim

# Cài đặt Python3, pip và các thư viện cần thiết cho AlPytide Engine
RUN apt-get update && apt-get install -y python3 python3-pip python3-tk && rm -rf /var/lib/apt-lists/*
RUN pip3 install --no-cache-dir --break-system-packages colorama requests matplotlib numpy pandas

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
 
