# 邻里集后端镜像（前端 + API 同进程）
FROM node:22-alpine

WORKDIR /app

# 仅复制后端目录
COPY . .

# node:sqlite 在 Node 22 仍需实验开关
EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0 NODE_ENV=production

CMD ["node", "--experimental-sqlite", "--no-warnings", "server.js"]
