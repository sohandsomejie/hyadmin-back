const Router = require('@koa/router');
const { authMiddleware } = require('../utils/auth');
const { ok, created, notFound, conflict, badRequest } = require('../utils/res');
const Types = require('../dao/activityTypes');
const Sessions = require('../dao/sessions');

module.exports = (router, prefix = '') => {
  const base = `${prefix}/api/v1/activity-types`;
  const sub = new Router();

  // GET /activity-types
  sub.get('/', authMiddleware(), async (ctx) => {
    const rows = await Types.listTypes();
    return ok(ctx, rows.map(r => ({
      id: String(r.id), code: r.code, name: r.name, enabled: !!r.enabled,
      scheduleRule: r.schedule_weekday != null ? { weekday: r.schedule_weekday, time: r.schedule_time?.slice(0,5) } : null,
      durationMinutes: r.duration_minutes,
    })));
  });

  // POST /activity-types
  sub.post('/', authMiddleware(), async (ctx) => {
    const { code, name, enabled = true, scheduleRule, durationMinutes } = ctx.request.body || {};
    if (!code || !name) return badRequest(ctx, '缺少 code 或 name');
    const t = await Types.createType({ code, name, enabled, scheduleRule, durationMinutes });
    return created(ctx, {
      id: String(t.id), code: t.code, name: t.name, enabled: !!t.enabled,
      scheduleRule: t.schedule_weekday != null ? { weekday: t.schedule_weekday, time: t.schedule_time?.slice(0,5) } : null,
      durationMinutes: t.duration_minutes,
    });
  });

  // PUT /activity-types/:id
  sub.put('/:id', authMiddleware(), async (ctx) => {
    const updated = await Types.updateType(ctx.params.id, ctx.request.body || {});
    if (!updated) return notFound(ctx);
    return ok(ctx, {
      id: String(updated.id), code: updated.code, name: updated.name, enabled: !!updated.enabled,
      scheduleRule: updated.schedule_weekday != null ? { weekday: updated.schedule_weekday, time: updated.schedule_time?.slice(0,5) } : null,
      durationMinutes: updated.duration_minutes,
    });
  });

  // DELETE /activity-types/:id
  sub.delete('/:id', authMiddleware(), async (ctx) => {
    const id = ctx.params.id;
    const s = await Sessions.listSessions({ typeId: id, limit: 1, offset: 0 });
    if (s.total > 0) return conflict(ctx, '存在关联场次，禁止删除');
    await Types.deleteType(id);
    ctx.status = 204;
  });

  // 可选：GET /activity-types/:id/last-session-summary
  sub.get('/:id/last-session-summary', authMiddleware(), async (ctx) => {
    const id = ctx.params.id;
    const s = await Sessions.listSessions({ typeId: id, limit: 1, offset: 0 });
    const last = s.items?.[0];
    if (!last) return ok(ctx, { session: null, counts: { participated: 0, leave: 0, unknown: 0, unset: 0 }, tops: [] });
    const rows = await require('../db').query(
      'SELECT p.status, p.score, p.member_id, m.nickname FROM participations p LEFT JOIN members m ON m.id = p.member_id WHERE p.session_id = ?',
      [last.id]
    );
    const counts = { participated: 0, leave: 0, unknown: 0, unset: 0 };
    rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const tops = rows
      .filter(r => r.score != null)
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, 3)
      .map((r) => ({ memberId: String(r.member_id), nickname: r.nickname, score: Number(r.score) }));
    return ok(ctx, { session: last, counts, tops });
  });

  router.use(base, sub.routes(), sub.allowedMethods());
};


