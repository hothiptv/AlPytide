FROM node:18-slim

# Cài đặt Python3
RUN apt-get update && apt-get install -y python3 python3-pip

WORKDIR /app

# Copy package.json và cài đặt thư viện Node
COPY package*.json ./
RUN npm install

# Copy toàn bộ mã nguồn
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
