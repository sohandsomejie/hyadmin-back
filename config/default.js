module.exports = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  mysql: {
    host: process.env.DB_HOST || '192.168.31.2',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1233300',
    database: process.env.DB_NAME || 'ninja_org',
  }
};