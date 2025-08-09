# 使用 Node.js 20 Alpine 作为基础镜像
FROM m.daocloud.io/docker.io/node:20-alpine

# 启用 corepack 并设置 npm 镜像源
WORKDIR .
RUN corepack enable
RUN npm config set registry https://registry.npmmirror.com

# 复制依赖文件并安装（包括 devDependencies）
COPY package.json  pnpm-lock.yaml ./
RUN npm install --frozen-lockfile

# 复制源代码
COPY . .

# 暴露 Koa 默认端口（通常是 3000）
EXPOSE 3000

# 启动开发服务器（使用 nodemon 或直接运行 dev）
CMD ["npm", "run", "start"]