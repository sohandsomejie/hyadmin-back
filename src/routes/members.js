const Router = require('@koa/router');
const { authMiddleware } = require('../utils/auth');
const { ok, created, notFound, badRequest } = require('../utils/res');
const Members = require('../dao/members');
const { query } = require('../db');

module.exports = (router, prefix = '') => {
  const base = `${prefix}/api/v1/members`;
  const sub = new Router();

  // GET /members
  sub.get('/', authMiddleware(), async (ctx) => {
    const { keyword, status, role, page = 1, pageSize = 20 } = ctx.query;
    const limit = Number(pageSize) || 20;
    const offset = (Number(page) - 1) * limit;
    const data = await Members.listMembers({ keyword, status, role, limit, offset });
    return ok(ctx, data);
  });

  // POST /members
  sub.post('/', authMiddleware(), async (ctx) => {
    const body = ctx.request.body || {};
    if (!body.nickname) return badRequest(ctx, '缺少 nickname');
    // 重名校验
    const dup = await Members.existsNickname(body.nickname);
    if (dup) return badRequest(ctx, '昵称已存在');
    const m = await Members.createMember(body);
    return created(ctx, m);
  });

  // GET /members/:id
  sub.get('/:id', authMiddleware(), async (ctx) => {
    const m = await Members.getMember(ctx.params.id);
    if (!m) return notFound(ctx);
    return ok(ctx, m);
  });

  // PUT /members/:id
  sub.put('/:id', authMiddleware(), async (ctx) => {
    const body = ctx.request.body || {};
    if (body.nickname) {
      const dup = await Members.existsNickname(body.nickname, ctx.params.id);
      if (dup) return badRequest(ctx, '昵称已存在');
    }
    const m = await Members.updateMember(ctx.params.id, body);
    if (!m) return notFound(ctx);
    return ok(ctx, m);
  });
  // POST /members/generate  自动生成成员（若未传 nickname 则生成唯一昵称）
  sub.post('/generate', authMiddleware(), async (ctx) => {
    const body = ctx.request.body || {};
    let nickname = body.nickname || null;
    if (!nickname) {
      // 生成唯一昵称：Member_YYYYMMDDHHmmss_随机4位
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      let base = `Member_${stamp}`;
      nickname = base;
      let tries = 0;
      while (await Members.existsNickname(nickname)) {
        const suffix = Math.random().toString(36).slice(2, 6);
        nickname = `${base}_${suffix}`;
        if (++tries > 5) break;
      }
    } else {
      const dup = await Members.existsNickname(nickname);
      if (dup) return badRequest(ctx, '昵称已存在');
    }
    const createdMember = await Members.createMember({ ...body, nickname });
    return created(ctx, createdMember);
  });

  // PATCH /members/:id/status
  sub.patch('/:id/status', authMiddleware(), async (ctx) => {
    const { status, leaveAt } = ctx.request.body || {};
    const mm = await Members.getMember(ctx.params.id);
    if (!mm) return notFound(ctx);
    const m = await Members.updateMember(ctx.params.id, { status, leaveAt });
    return ok(ctx, m);
  });

  // DELETE /members/:id
  sub.delete('/:id', authMiddleware(), async (ctx) => {
    const id = ctx.params.id;
    const exists = await Members.getMember(id);
    if (!exists) return notFound(ctx);
    const okDel = await Members.deleteMember(id);
    if (!okDel) return notFound(ctx);
    return ok(ctx, { id: String(id), deleted: true });
  });

  // GET /members/:id/participations
  sub.get('/:id/participations', authMiddleware(), async (ctx) => {
    const { typeId, from, to, page = 1, pageSize = 20 } = ctx.query;
    const limit = Number(pageSize) || 20;
    const offset = (Number(page) - 1) * limit;
    const conditions = ['p.member_id = ?'];
    const params = [ctx.params.id];
    if (typeId) { conditions.push('s.type_id = ?'); params.push(typeId); }
    if (from) { conditions.push('s.start_at >= ?'); params.push(from); }
    if (to) { conditions.push('s.end_at <= ?'); params.push(to); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const items = await query(
      `SELECT p.*, s.id as session_id, s.type_id, s.name as session_name, s.start_at, s.end_at
       FROM participations p
       LEFT JOIN activity_sessions s ON s.id = p.session_id
       ${where}
       ORDER BY s.start_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRows = await query(
      `SELECT COUNT(*) as c FROM participations p LEFT JOIN activity_sessions s ON s.id=p.session_id ${where}`,
      params
    );
    return ok(ctx, {
      items: items.map(r => ({
        id: String(r.id), sessionId: String(r.session_id), memberId: String(r.member_id), status: r.status,
        score: Number(r.score), setBy: r.set_by ? String(r.set_by) : null, setAt: r.set_at,
        session: { id: String(r.session_id), typeId: String(r.type_id), name: r.session_name, startAt: r.start_at, endAt: r.end_at },
      })),
      total: totalRows[0]?.c || 0,
    });
  });

  router.use(base, sub.routes(), sub.allowedMethods());
};


