// 统一响应封装

function ok(ctx, data) {
  ctx.status = 200;
  ctx.body = data;
}

function created(ctx, data) {
  ctx.status = 201;
  ctx.body = data;
}

function error(ctx, status, code, message, details) {
  ctx.status = status;
  ctx.body = { error: { code, message, details } };
}

function badRequest(ctx, message = '参数校验失败', details) {
  return error(ctx, 400, 'VALIDATION_ERROR', message, details);
}

function unauthorized(ctx, message = '未认证') {
  return error(ctx, 401, 'UNAUTHORIZED', message);
}

function forbidden(ctx, message = '无权限') {
  return error(ctx, 403, 'FORBIDDEN', message);
}

function notFound(ctx, message = '资源不存在') {
  return error(ctx, 404, 'NOT_FOUND', message);
}

function conflict(ctx, message = '资源冲突') {
  return error(ctx, 409, 'CONFLICT', message);
}

function internal(ctx, message = '服务器错误') {
  return error(ctx, 500, 'INTERNAL_SERVER_ERROR', message);
}

module.exports = { ok, created, badRequest, unauthorized, forbidden, notFound, conflict, internal };


