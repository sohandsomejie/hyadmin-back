const Router = require('@koa/router');
const { ok, created, badRequest, unauthorized } = require('../utils/res');
const { signToken, authMiddleware } = require('../utils/auth');
const { query } = require('../db');
const bcrypt = require('bcryptjs');

module.exports = (router, prefix = '') => {
  const base = `${prefix}/api/v1/auth`;
  const sub = new Router();

  // POST /auth/login
  sub.post('/login', async (ctx) => {
    const { username, password } = ctx.request.body || {};
    if (!username || !password) return badRequest(ctx, '缺少用户名或密码');
    const rows = await query('SELECT * FROM users WHERE username=?', [username]);
    const user = rows[0];
    if (!user) return unauthorized(ctx, '用户不存在');
    const okPwd = await bcrypt.compare(password, user.password_hash);
    if (!okPwd) return unauthorized(ctx, '密码错误');
    const token = signToken({ id: String(user.id), username: user.username });
    await query('UPDATE users SET last_login_at = NOW(3) WHERE id=?', [user.id]);
    const refreshed = (await query('SELECT * FROM users WHERE id=?', [user.id]))[0];
    return ok(ctx, { token, user: { id: String(refreshed.id), username: refreshed.username, createdAt: refreshed.created_at, lastLoginAt: refreshed.last_login_at } });
  });

  // GET /auth/profile
  sub.get('/profile', authMiddleware(), async (ctx) => {
    const u = ctx.state.user;
    const rows = await query('SELECT * FROM users WHERE id=?', [u.id]);
    const user = rows[0];
    return ok(ctx, { id: String(user.id), username: user.username, createdAt: user.created_at, lastLoginAt: user.last_login_at });
  });

  router.use(base, sub.routes(), sub.allowedMethods());
};


