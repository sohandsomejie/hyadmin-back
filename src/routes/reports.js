const Router = require('@koa/router');
const { authMiddleware } = require('../utils/auth');
const { ok } = require('../utils/res');
const { query } = require('../db');

module.exports = (router, prefix = '') => {
  const base = `${prefix}/api/v1/reports`;
  const sub = new Router();

  // GET /reports/leaderboard
  sub.get('/leaderboard', authMiddleware(), async (ctx) => {
    const { typeId, period = 'custom', from, to, year, quarter, month, sort = 'score', page = 1, pageSize = 20 } = ctx.query;
    let start = from, end = to;
    const now = new Date();
    if (period !== 'custom') {
      const y = Number(year) || now.getUTCFullYear();
      if (period === 'year') {
        start = new Date(Date.UTC(y, 0, 1)).toISOString();
        end = new Date(Date.UTC(y + 1, 0, 1)).toISOString();
      } else if (period === 'quarter') {
        const q = Math.min(4, Math.max(1, Number(quarter) || 1));
        const m = (q - 1) * 3;
        start = new Date(Date.UTC(y, m, 1)).toISOString();
        end = new Date(Date.UTC(y, m + 3, 1)).toISOString();
      } else if (period === 'month') {
        const m = Math.max(0, Math.min(11, (Number(month) || (now.getUTCMonth() + 1)) - 1));
        start = new Date(Date.UTC(y, m, 1)).toISOString();
        end = new Date(Date.UTC(y, m + 1, 1)).toISOString();
      }
    }
    const limit = Number(pageSize) || 20;
    const offset = (Number(page) - 1) * limit;

    const conditions = [];
    const params = [];
    if (typeId) { conditions.push('s.type_id = ?'); params.push(typeId); }
    if (start) { conditions.push('s.start_at >= ?'); params.push(start); }
    if (end) { conditions.push('s.end_at <= ?'); params.push(end); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query(
      `SELECT p.member_id, m.nickname, m.role,
              SUM(p.score) as totalScore,
              AVG(p.score) as avgScore,
              SUM(CASE WHEN p.status='participated' THEN 1 ELSE 0 END) as attendedTimes,
              SUM(CASE WHEN p.status='leave' THEN 1 ELSE 0 END) as leaveTimes,
              SUM(CASE WHEN p.status='unknown' THEN 1 ELSE 0 END) as unknownTimes,
              COUNT(*) as totalTimes
       FROM participations p
       LEFT JOIN activity_sessions s ON s.id = p.session_id
       LEFT JOIN members m ON m.id = p.member_id
       ${where}
       GROUP BY p.member_id
       ORDER BY ${sort === 'avgScore' ? 'avgScore DESC' : sort === 'attendance' ? '(attendedTimes / NULLIF(totalTimes,0)) DESC' : 'totalScore DESC'}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const totalRows = await query(
      `SELECT COUNT(DISTINCT p.member_id) as c
       FROM participations p
       LEFT JOIN activity_sessions s ON s.id = p.session_id
       ${where}`,
      params
    );
    
    return ok(ctx, {
      items: rows.map(r => ({
        member: { id: String(r.member_id), nickname: r.nickname, role: r.role },
        totalScore: Number(r.totalScore || 0),
        avgScore: Number(r.avgScore || 0),
        attendance: r.totalTimes ? Number(r.attendedTimes || 0) / Number(r.totalTimes || 1) : 0,
        times: Number(r.totalTimes || 0),
        attendedTimes: Number(r.attendedTimes || 0),
        leaveTimes: Number(r.leaveTimes || 0),
        unknownTimes: Number(r.unknownTimes || 0),
      })),
      total: totalRows[0]?.c || 0,
    });
  });

  router.use(base, sub.routes(), sub.allowedMethods());
};


