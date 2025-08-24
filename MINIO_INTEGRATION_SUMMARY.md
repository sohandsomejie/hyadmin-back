# MinIO 集成总结

## 概述

已成功将图片存储从本地文件系统改为使用 MinIO 对象存储，提供了更好的可扩展性、可靠性和性能。

## 主要特性

### 1. 智能存储策略

- **主要存储**: 图片文件自动上传到 MinIO
- **容错机制**: 如果 MinIO 上传失败，自动回退到本地存储
- **文件组织**: 按日期自动分类存储 `images/YYYY/MM/DD/filename.ext`

### 2. 灵活的访问方式

- **本地环境**: 使用 MinIO 预签名 URL（24小时有效期）
- **生产环境**: 通过 API 路由访问，自动生成预签名 URL
- **直接访问**: 支持通过 `/api/v1/files/*` 路由访问文件

### 3. 完整的 MinIO 集成

- 自动创建存储桶
- 文件上传、下载、删除操作
- 文件存在性检查
- 预签名 URL 生成

## 新增文件

### 1. MinIO 工具模块 (`src/utils/minio.js`)

```javascript
// 主要功能
- ensureBucket()      // 确保存储桶存在
- uploadFile()        // 上传文件到 MinIO
- getPresignedUrl()   // 获取预签名 URL
- deleteFile()        // 删除文件
- fileExists()        // 检查文件是否存在
- getFileInfo()       // 获取文件信息
```

### 2. 文件访问路由 (`src/routes/files.js`)

```javascript
// 主要路由
- GET /api/v1/files/*     // 获取文件（重定向到预签名 URL）
- HEAD /api/v1/files/*    // 检查文件信息
```

### 3. 更新的 AI 解析路由 (`src/routes/ai-parses.js`)

- 集成 MinIO 上传逻辑
- 智能 URL 生成策略
- 容错机制

## 配置选项

### 环境变量

```bash
# MinIO 服务器配置
MINIO_ENDPOINT=localhost          # MinIO 服务器地址
MINIO_PORT=9000                   # MinIO 服务器端口
MINIO_USE_SSL=false               # 是否使用 HTTPS
MINIO_ACCESS_KEY=minioadmin       # 访问密钥
MINIO_SECRET_KEY=minioadmin       # 秘密密钥
MINIO_BUCKET=uploads              # 存储桶名称
MINIO_REGION=us-east-1           # 区域
```

### 配置文件 (`config/default.js`)

```javascript
minio: {
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  bucketName: process.env.MINIO_BUCKET || 'uploads',
  region: process.env.MINIO_REGION || 'us-east-1'
}
```

## 工作流程

### 1. 图片上传流程

```
用户上传图片 → 保存到临时文件 → 上传到 MinIO → 删除临时文件 → 记录到数据库
                                    ↓
                              失败时回退到本地存储
```

### 2. 图片访问流程

```
请求图片 → 检查 MinIO → 生成预签名 URL → 重定向到 MinIO
```

### 3. 容错流程

```
MinIO 上传失败 → 记录错误日志 → 使用本地存储 → 继续正常流程
```

## 数据库变化

### 字段含义更新

- `imageUrl`: 现在存储 MinIO 对象名称（如：`images/2024/01/15/filename.jpg`）
- `imagePath`: 同样存储 MinIO 对象名称

### 兼容性

- 保持原有字段结构不变
- 支持本地存储和 MinIO 存储的混合使用

## 测试和验证

### 1. 运行测试脚本

```bash
node test-minio.js
```

### 2. 测试要点

- MinIO 连接测试
- 文件上传/下载测试
- 预签名 URL 生成测试
- 容错机制测试

## 部署注意事项

### 1. MinIO 服务器

- 确保 MinIO 服务器正在运行
- 检查网络连接和防火墙设置
- 验证访问密钥和秘密密钥

### 2. 环境配置

- 根据实际环境设置正确的 MinIO 地址
- 生产环境建议启用 SSL
- 设置适当的存储桶权限

### 3. 监控和日志

- 监控 MinIO 上传成功率
- 关注容错回退的频率
- 定期检查存储桶使用情况

## 下一步建议

### 1. 立即测试

- 启动 MinIO 服务器
- 运行测试脚本验证连接
- 测试图片上传功能

### 2. 配置优化

- 根据实际 MinIO 配置调整环境变量
- 设置合适的预签名 URL 过期时间
- 配置存储桶策略和权限

### 3. 生产环境准备

- 配置公网可访问的 MinIO 地址
- 设置 SSL 证书
- 配置备份和监控策略

## 相关文件

- `src/utils/minio.js` - MinIO 工具模块
- `src/routes/files.js` - 文件访问路由
- `src/routes/ai-parses.js` - 更新的 AI 解析路由
- `config/default.js` - MinIO 配置
- `env.example` - 环境变量示例
- `README.md` - 更新后的项目文档
- `test-minio.js` - MinIO 集成测试脚本

## 总结

MinIO 集成已完成，提供了：

- ✅ 对象存储能力
- ✅ 智能容错机制
- ✅ 灵活的访问方式
- ✅ 完整的配置选项
- ✅ 详细的文档说明

现在您可以享受 MinIO 带来的高性能、高可靠性的对象存储服务！
