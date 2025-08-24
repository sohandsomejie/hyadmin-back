module.exports = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  // MinIO 配置
  minio: {
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucketName: process.env.MINIO_BUCKET || 'hyadmin-img',
    region: process.env.MINIO_REGION || 'us-east-1'
  },
  mysql: {
    host: process.env.DB_HOST || '192.168.31.2',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1233300',
    database: process.env.DB_NAME || 'ninja_org',
  }
};