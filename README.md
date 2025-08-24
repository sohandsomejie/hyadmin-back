# HyAdmin Backend

## 环境变量配置

### 必需的环境变量

1. **APP_BASE_URL**: 应用的基础URL，用于构建图片的绝对URL
   - 开发环境: `http://localhost:3000`
   - 生产环境: `https://yourdomain.com`

### MinIO 配置

2. **MINIO_ENDPOINT**: MinIO 服务器地址
   - 默认值: `localhost`

3. **MINIO_PORT**: MinIO 服务器端口
   - 默认值: `9000`

4. **MINIO_USE_SSL**: 是否使用 HTTPS 连接
   - 默认值: `false`
   - 生产环境建议设置为 `true`

5. **MINIO_ACCESS_KEY**: MinIO 访问密钥
   - 默认值: `minioadmin`

6. **MINIO_SECRET_KEY**: MinIO 秘密密钥
   - 默认值: `minioadmin`

7. **MINIO_BUCKET**: MinIO 存储桶名称
   - 默认值: `uploads`

8. **MINIO_REGION**: MinIO 区域
   - 默认值: `us-east-1`

### 配置方法

#### 方法1: 直接设置环境变量

在启动服务器之前设置环境变量：

**Windows (CMD):**
```cmd
set APP_BASE_URL=http://localhost:3000
set MINIO_ENDPOINT=localhost
set MINIO_PORT=9000
set MINIO_USE_SSL=false
set MINIO_ACCESS_KEY=minioadmin
set MINIO_SECRET_KEY=minioadmin
set MINIO_BUCKET=uploads
npm start
```

**Windows (PowerShell):**
```powershell
$env:APP_BASE_URL="http://localhost:3000"
$env:MINIO_ENDPOINT="localhost"
$env:MINIO_PORT="9000"
$env:MINIO_USE_SSL="false"
$env:MINIO_ACCESS_KEY="minioadmin"
$env:MINIO_SECRET_KEY="minioadmin"
$env:MINIO_BUCKET="uploads"
npm start
```

**Linux/Mac:**
```bash
export APP_BASE_URL=http://localhost:3000
export MINIO_ENDPOINT=localhost
export MINIO_PORT=9000
export MINIO_USE_SSL=false
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=minioadmin
export MINIO_BUCKET=uploads
npm start
```

#### 方法2: 使用 .env 文件

1. 复制 `env.example` 文件为 `.env`
2. 修改 `.env` 文件中的值
3. 安装 dotenv 包: `npm install dotenv`
4. 在 `server.js` 开头添加: `require('dotenv').config()`

#### 方法3: 修改配置文件

直接编辑 `config/default.js` 文件中的相应值。

## MinIO 存储特性

### 文件组织
- 图片文件按日期自动分类存储：`images/YYYY/MM/DD/filename.ext`
- 支持自动创建存储桶
- 提供预签名 URL 访问

### 容错机制
- 如果 MinIO 上传失败，自动回退到本地存储
- 保持系统稳定性和可用性

### 文件访问
- 通过 `/api/v1/files/*` 路由访问文件
- 自动生成预签名 URL 进行重定向
- 支持文件存在性检查

## 启动服务器

```bash
npm install
npm start
```

## API 文档

详细的API文档请参考 `docs/api.md` 文件。
