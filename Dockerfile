FROM node:18-slim

# Cài đặt Python 3 cùng các thư viện hỗ trợ phổ biến (Firebase, Requests, PyMongo...)
RUN apt-get update && apt-get install -y python3 python3-pip && \
    pip3 install --no-cache-dir requests firebase-admin pymongo urllib3

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
