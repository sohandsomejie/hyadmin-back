const Minio = require('minio');
const config = require('../../config/default');

// 创建 MinIO 客户端
const minioClient = new Minio.Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
  region: config.minio.region
});

// 确保 bucket 存在
async function ensureBucket() {
  try {
    const exists = await minioClient.bucketExists(config.minio.bucketName);
    if (!exists) {
      await minioClient.makeBucket(config.minio.bucketName, config.minio.region);
      console.log(`Bucket '${config.minio.bucketName}' created successfully.`);
    }
  } catch (err) {
    console.error('Error ensuring bucket exists:', err);
    throw err;
  }
}

// 上传文件到 MinIO
async function uploadFile(filePath, objectName, contentType) {
  try {
    await ensureBucket();
    
    const result = await minioClient.fPutObject(
      config.minio.bucketName,
      objectName,
      filePath,
      { 'Content-Type': contentType }
    );
    
    console.log(`File uploaded successfully. ETag: ${result.etag}`);
    return result;
  } catch (err) {
    console.error('Error uploading file to MinIO:', err);
    throw err;
  }
}

// 获取文件的预签名 URL（用于下载）
async function getPresignedUrl(objectName, expirySeconds = 24 * 60 * 60) {
  try {
    const url = await minioClient.presignedGetObject(
      config.minio.bucketName,
      objectName,
      expirySeconds
    );
    return url;
  } catch (err) {
    console.error('Error generating presigned URL:', err);
    throw err;
  }
}

// 删除文件
async function deleteFile(objectName) {
  try {
    await minioClient.removeObject(config.minio.bucketName, objectName);
    console.log(`File '${objectName}' deleted successfully.`);
  } catch (err) {
    console.error('Error deleting file from MinIO:', err);
    throw err;
  }
}

// 检查文件是否存在
async function fileExists(objectName) {
  try {
    await minioClient.statObject(config.minio.bucketName, objectName);
    return true;
  } catch (err) {
    if (err.code === 'NoSuchKey') {
      return false;
    }
    throw err;
  }
}

// 获取文件信息
async function getFileInfo(objectName) {
  try {
    const stat = await minioClient.statObject(config.minio.bucketName, objectName);
    return stat;
  } catch (err) {
    console.error('Error getting file info:', err);
    throw err;
  }
}

module.exports = {
  minioClient,
  ensureBucket,
  uploadFile,
  getPresignedUrl,
  deleteFile,
  fileExists,
  getFileInfo
};
