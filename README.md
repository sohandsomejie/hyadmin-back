# HyAdmin Backend

## 环境变量配置

### 必需的环境变量

1. **APP_BASE_URL**: 应用的基础URL，用于构建图片的绝对URL
   - 开发环境: `http://localhost:3000`
   - 生产环境: `https://yourdomain.com`

### 配置方法

#### 方法1: 直接设置环境变量

在启动服务器之前设置环境变量：

**Windows (CMD):**

```cmd
set APP_BASE_URL=http://localhost:3000
npm start
```

**Windows (PowerShell):**

```powershell
$env:APP_BASE_URL="http://localhost:3000"
npm start
```

**Linux/Mac:**

```bash
export APP_BASE_URL=http://localhost:3000
npm start
```

#### 方法2: 使用 .env 文件

1. 复制 `env.example` 文件为 `.env`
2. 修改 `.env` 文件中的值
3. 安装 dotenv 包: `npm install dotenv`
4. 在 `server.js` 开头添加: `require('dotenv').config()`

#### 方法3: 修改配置文件

直接编辑 `config/default.js` 文件中的 `appBaseUrl` 值。

## 启动服务器

```bash
npm install
npm start
```

## API 文档

详细的API文档请参考 `docs/api.md` 文件。
