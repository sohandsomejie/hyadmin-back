const { query, exec } = require('../db');

async function listMembers({ keyword, status, role, limit = 20, offset = 0 }) {
  try {
    const conditions = [];
    const params = [];
    if (keyword) { conditions.push('(nickname LIKE ? OR qq LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    if (status) { conditions.push('status = ?'); params.push(status); }
    if (role) { conditions.push('role = ?'); params.push(role); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query(`SELECT * FROM members ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, Number(limit), Number(offset)]);
    const totalRows = await query(`SELECT COUNT(*) as c FROM members ${where}`, params);
    return { items: rows, total: totalRows[0]?.c || 0 };
  } catch (e) {
    throw new Error('listMembers error: ' + e.message);
  }
}

async function getMember(id) {
  try {
    const rows = await query('SELECT * FROM members WHERE id=?', [id]);
    return rows[0] || null;
  } catch (e) {
    throw new Error('getMember error: ' + e.message);
  }
}

async function createMember(data) {
  try {
    const { nickname, qq = null, status = 'normal', joinAt = null, role = 'member', remark = null } = data;
    if (!nickname) {
      throw Object.assign(new Error('nickname is required'), { code: 'INVALID_PARAM' });
    }
    const dup = await existsNickname(nickname);
    if (dup) {
      throw Object.assign(new Error('nickname already exists'), { code: 'DUPLICATE_NICKNAME' });
    }
    const res = await exec(
      'INSERT INTO members (nickname, qq, status, join_at, role, remark) VALUES (?,?,?,?,?,?)',
      [nickname, qq, status, joinAt, role, remark]
    );
    return getMember(res.insertId);
  } catch (e) {
    throw new Error('createMember error: ' + e.message);
  }
}

async function updateMember(id, data) {
  try {
    const exists = await getMember(id);
    if (!exists) return null;
    const nickname = data.nickname ?? exists.nickname;
    const qq = data.qq ?? exists.qq;
    const status = data.status ?? exists.status;
    const join_at = data.joinAt ?? exists.join_at;
    const leave_at = data.leaveAt ?? exists.leave_at;
    const role = data.role ?? exists.role;
    const remark = data.remark ?? exists.remark;
    if (!nickname) {
      throw Object.assign(new Error('nickname is required'), { code: 'INVALID_PARAM' });
    }
    const dup = await existsNickname(nickname, id);
    if (dup) {
      throw Object.assign(new Error('nickname already exists'), { code: 'DUPLICATE_NICKNAME' });
    }
    await exec('UPDATE members SET nickname=?, qq=?, status=?, join_at=?, leave_at=?, role=?, remark=? WHERE id=?',
      [nickname, qq, status, join_at, leave_at, role, remark, id]);
    return getMember(id);
  } catch (e) {
    throw new Error('updateMember error: ' + e.message);
  }
}

async function existsNickname(nickname, excludeId) {
  const params = [nickname];
  let sql = 'SELECT id FROM members WHERE nickname = ?';
  if (excludeId) { sql += ' AND id <> ?'; params.push(excludeId); }
  const rows = await query(sql, params);
  return rows.length > 0;
}

async function deleteMember(id) {
  try {
    // 若存在外键（参与记录）已在 schema 中 ON DELETE CASCADE；此处直接删除
    const res = await exec('DELETE FROM members WHERE id=?', [id]);
    return res.affectedRows > 0;
  } catch (e) {
    throw new Error('deleteMember error: ' + e.message);
  }
}

module.exports = { listMembers, getMember, createMember, updateMember, existsNickname, deleteMember };


