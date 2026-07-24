# 邻里集（后端 API + 前端同源托管）镜像
FROM node:22-alpine

WORKDIR /app

# 复制后端与前端（构建上下文为仓库根）
COPY server ./server
COPY web ./web

ENV HOST=0.0.0.0 NODE_ENV=production WEB_DIR=/app/web
EXPOSE 3000

# node:22 的 node:sqlite 仍需实验开关
CMD ["node", "--experimental-sqlite", "--no-warnings", "/app/server/server.js"]
