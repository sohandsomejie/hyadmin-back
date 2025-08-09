const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const serve = require('koa-static');
const path = require('path');
const cors = require('@koa/cors'); // 引入 cors 中间件

const app = new Koa();

// 中间件
app.use(cors()); // 使用 cors 中间件，默认允许所有跨域请求
app.use(bodyParser());
app.use(serve(path.join(__dirname, 'public')));

// 路由
const router = new Router();
require('./src/routes')(router);

app.use(router.routes()).use(router.allowedMethods());

// 错误处理
app.on('error', (err, ctx) => {
  console.error('Server error', err);
});

module.exports = app;