module.exports = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  db: {
    host: 'localhost',
    port: 27017,
    name: 'resume_maker'
  }
};