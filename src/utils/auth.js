const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'ninja_secret_key';

function signToken(payload, options = {}) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d', ...options });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function authMiddleware(optional = false) {
  return async (ctx, next) => {
    const header = ctx.get('authorization') || ctx.get('Authorization');
    if (!header) {
      if (optional) return next();
      ctx.status = 401;
      ctx.body = { error: { code: 'UNAUTHORIZED', message: '未认证' } };
      return;
    }
    const parts = header.split(' ');
    const token = parts.length === 2 ? parts[1] : parts[0];
    try {
      const decoded = verifyToken(token);
      ctx.state.user = decoded;
      await next();
    } catch (e) {
      ctx.status = 401;
      ctx.body = { error: { code: 'UNAUTHORIZED', message: '无效 Token' } };
    }
  };
}

module.exports = { signToken, verifyToken, authMiddleware };


