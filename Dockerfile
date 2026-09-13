FROM node:18-slim

# Cài đặt Lua và LuaJIT cùng các công cụ cần thiết
RUN apt-get update && apt-get install -y lua5.3 luajit lua-filesystem lua-sec lua-socket

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
