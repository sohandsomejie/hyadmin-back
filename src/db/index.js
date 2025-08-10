const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const config = require('../../config/default');

function getDbConfig(includeDatabase = true) {
  const base = {
    host: process.env.DB_HOST || config.mysql?.host || '127.0.0.1',
    port: Number(process.env.DB_PORT || config.mysql?.port || 3306),
    user: process.env.DB_USER || config.mysql?.user || 'root',
    password: process.env.DB_PASSWORD ?? (config.mysql?.password ?? ''),
    multipleStatements: true,
    timezone: 'Z',
  };
  if (includeDatabase) {
    return { ...base, database: process.env.DB_NAME || config.mysql?.database || 'ninja_org', connectionLimit: 10 };
  }
  return base;
}
let pool;

async function getPool() {
  if (!pool) {
    pool = mysql.createPool(getDbConfig(true));
  }
  return pool;
}

async function initSchema() {
  const sqlPath = path.join(__dirname, '../../docs/schema.mysql.sql');
  if (!fs.existsSync(sqlPath)) return;
  const sql = fs.readFileSync(sqlPath, 'utf8');
  // 使用不指定 database 的连接，保证在库不存在时也能执行 CREATE DATABASE
  const connection = await mysql.createConnection(getDbConfig(false));
  try {
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

async function query(sql, params) {
  const p = await getPool();
  const [rows] = await p.query(sql, params);
  return rows;
}

async function exec(sql, params) {
  const p = await getPool();
  const [result] = await p.execute(sql, params);
  return result;
}

module.exports = { getPool, initSchema, query, exec };


