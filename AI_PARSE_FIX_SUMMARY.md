# AI 解析接口修复总结

## 问题描述

根据错误日志，AI 解析接口遇到了以下问题：

1. **第一个错误**: `"absoluteImageUrl is required in input form"`
2. **第二个错误**: `"absoluteImageUrl in input form must be a file"`

## 根本原因

根据官方文档分析，问题在于 `inputs` 参数中的文件类型变量格式不正确：

- 官方文档要求：文件类型变量应该是**列表格式**，每个元素包含特定的字段结构
- 原代码错误：将 `absoluteImageUrl` 设置为字符串URL，而不是文件对象列表

## 修复内容

### 1. 修复了 `absoluteImageUrl` 字段格式

**修复前**:
```javascript
inputs.absoluteImageUrl = options?.absoluteImageUrl; // 字符串URL
```

**修复后**:
```javascript
const imageFile = {
  type: 'image',
  transfer_method: 'remote_url',
  url: options?.absoluteImageUrl,
  filename: job.filename || 'image.jpg',
  size: job.sizeBytes || 0
};

// 设置为文件对象列表
inputs.absoluteImageUrl = [imageFile];
```

### 2. 按照官方文档要求构建文件对象

根据官方文档，文件列表类型变量的每个元素应包含：

- `type` (string): 文件类型，如 'image'
- `transfer_method` (string): 传递方式，如 'remote_url'
- `url` (string): 图片地址（当 transfer_method 为 remote_url 时）
- `filename` (string): 文件名
- `size` (number): 文件大小

### 3. 保持向后兼容性

同时保持了原有的文件数组格式，确保其他工作流仍然可以正常工作：

```javascript
// 同时保持原有的文件数组格式以兼容其他工作流
const filesArray = Array.isArray(inputs[fileVar]) ? inputs[fileVar] : [];
filesArray.push(imageFile);
inputs[fileVar] = filesArray;
```

### 4. 增强了调试日志

添加了详细的调试信息，包括完整的 `inputs` 对象和请求体内容：

```javascript
console.log('[AI] Trigger start(JSON)', { 
  endpoint, 
  jobId: job.id, 
  fileVar, 
  absoluteImageUrl: options?.absoluteImageUrl, 
  inputs,
  body: JSON.stringify(body, null, 2)
});
```

## 修复后的数据结构

现在 `inputs.absoluteImageUrl` 字段包含：

```json
{
  "absoluteImageUrl": [
    {
      "type": "image",
      "transfer_method": "remote_url",
      "url": "http://localhost:3000/uploads/image.jpg",
      "filename": "image.jpg",
      "size": 1024
    }
  ]
}
```

## 验证结果

通过测试脚本验证，修复后的数据结构完全符合官方文档要求：

- ✅ `absoluteImageUrl` 字段存在且为列表格式
- ✅ 每个文件对象包含必需的字段
- ✅ 文件类型和传递方式正确
- ✅ 保持向后兼容性

## 下一步

1. 重新测试 AI 解析接口
2. 监控日志输出，确认不再出现相关错误
3. 如果仍有问题，根据新的错误信息进一步调试

## 相关文件

- `src/routes/ai-parses.js` - 主要修复文件
- `config/default.js` - 配置文件，添加了 `appBaseUrl` 支持
- `env.example` - 环境变量示例文件
- `README.md` - 项目说明文档
