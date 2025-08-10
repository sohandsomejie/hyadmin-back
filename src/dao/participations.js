const { query, exec } = require('../db');

async function listBySession(sessionId) {
  try {
    return await query(
      `SELECT p.*, m.nickname FROM participations p
       LEFT JOIN members m ON p.member_id = m.id
       WHERE p.session_id=? ORDER BY p.id ASC`,
      [sessionId]
    );
  } catch (e) {
    throw new Error('listBySession error: ' + e.message);
  }
}

async function createOne(sessionId, { memberId, status = 'unset', score = 0, note = null }, operatorId) {
  try {
    const res = await exec(
      'INSERT INTO participations (session_id, member_id, status, score, note, set_by) VALUES (?,?,?,?,?,?)',
      [sessionId, memberId, status, score, note, operatorId || null]
    );
    const rows = await query('SELECT * FROM participations WHERE id=?', [res.insertId]);
    return rows[0];
  } catch (e) {
    throw new Error('createOne error: ' + e.message);
  }
}

async function updateOne(sessionId, pid, data, operatorId) {
  try {
    const exists = await query('SELECT * FROM participations WHERE id=? AND session_id=?', [pid, sessionId]);
    if (!exists[0]) return null;
    const status = data.status ?? exists[0].status;
    const score = data.score ?? exists[0].score;
    const note = data.note ?? exists[0].note;
    await exec('UPDATE participations SET status=?, score=?, note=?, set_by=?, set_at=NOW(3) WHERE id=?', [status, score, note, operatorId || null, pid]);
    const rows = await query('SELECT * FROM participations WHERE id=?', [pid]);
    return rows[0];
  } catch (e) {
    throw new Error('updateOne error: ' + e.message);
  }
}

async function deleteOne(sessionId, pid) {
  try {
    await exec('DELETE FROM participations WHERE id=? AND session_id=?', [pid, sessionId]);
  } catch (e) {
    throw new Error('deleteOne error: ' + e.message);
  }
}

async function bulkUpsert(sessionId, items, operatorId) {
  try {
    // Upsert 基于唯一键 (session_id, member_id)
    if (!items?.length) return [];
    const values = [];
    const params = [];
    for (const it of items) {
      values.push('(?,?,?,?,?,?)');
      params.push(sessionId, it.memberId, it.status || 'unset', it.score ?? 0, it.note || null, operatorId || null);
    }
    const sql = `INSERT INTO participations (session_id, member_id, status, score, note, set_by)
                 VALUES ${values.join(',')}
                 ON DUPLICATE KEY UPDATE status=VALUES(status), score=VALUES(score), note=VALUES(note), set_by=VALUES(set_by), set_at=NOW(3)`;
    await exec(sql, params);
    return listBySession(sessionId);
  } catch (e) {
    throw new Error('bulkUpsert error: ' + e.message);
  }
}

module.exports = { listBySession, createOne, updateOne, deleteOne, bulkUpsert };


