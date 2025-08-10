const { query, exec, getPool } = require('../db');

async function getSession(id) {
  try {
    const rows = await query('SELECT * FROM activity_sessions WHERE id=?', [id]);
    return rows[0] || null;
  } catch (e) {
    throw new Error('getSession error: ' + e.message);
  }
}

async function listSessions({ typeId, from, to, limit = 20, offset = 0 }) {
  try {
    const conditions = [];
    const params = [];
    if (typeId) { conditions.push('type_id = ?'); params.push(typeId); }
    if (from) { conditions.push('start_at >= ?'); params.push(from); }
    if (to) { conditions.push('end_at <= ?'); params.push(to); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const items = await query(
      `SELECT * FROM activity_sessions ${where} ORDER BY start_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    const totalRows = await query(`SELECT COUNT(*) as c FROM activity_sessions ${where}`, params);
    return { items: items.map(m => ({ ...m, id: String(m.id), typeId: String(m.type_id) })), total: totalRows[0]?.c || 0 };
  } catch (e) {
    throw new Error('listSessions error: ' + e.message);
  }
}

function toMysqlDatetime(str) {
  if (!str) return null;
  // 只保留到秒，去掉毫秒和Z
  return new Date(str).toISOString().replace('T', ' ').substring(0, 19);
}

async function createSession({ typeId, name, startAt, endAt, notes }, operatorId) {
  // 使用事务，确保会话和默认参与记录一起成功
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const start = toMysqlDatetime(startAt);
    const end = toMysqlDatetime(endAt);
    const [res] = await conn.execute(
      'INSERT INTO activity_sessions (type_id, name, start_at, end_at, notes) VALUES (?,?,?,?,?)',
      [typeId, name, start, end, notes || null]
    );
    const sessionId = res.insertId;
    await conn.execute(
      `INSERT INTO participations (session_id, member_id, status, score, note, set_by)
       SELECT ?, m.id, 'unset', 0, NULL, ? FROM members m WHERE m.status='normal' AND m.role != 'trainee'`,
      [sessionId, operatorId || null]
    );
    await conn.commit();
    return getSession(sessionId);
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    throw new Error('createSession error: ' + e.message);
  } finally {
    conn.release();
  }
}

async function updateSession(id, data) {
  try {
    const exists = await getSession(id);
    if (!exists) return null;
    const name = data.name ?? exists.name;
    const start_at = data.startAt ?? exists.start_at;
    const end_at = data.endAt ?? exists.end_at;
    const notes = data.notes ?? exists.notes;
    await exec('UPDATE activity_sessions SET name=?, start_at=?, end_at=?, notes=? WHERE id=?', [name, start_at, end_at, notes, id]);
    return getSession(id);
  } catch (e) {
    throw new Error('updateSession error: ' + e.message);
  }
}

async function deleteSession(id) {
  try {
    await exec('DELETE FROM activity_sessions WHERE id=?', [id]);
  } catch (e) {
    throw new Error('deleteSession error: ' + e.message);
  }
}

module.exports = { getSession, listSessions, createSession, updateSession, deleteSession };


