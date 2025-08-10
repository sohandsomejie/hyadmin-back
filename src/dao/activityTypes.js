const { query, exec } = require('../db');

async function listTypes() {
  try {
    return await query('SELECT * FROM activity_types ORDER BY id ASC');
  } catch (e) {
    throw new Error('listTypes error: ' + e.message);
  }
}

async function getType(id) {
  try {
    const rows = await query('SELECT * FROM activity_types WHERE id = ?', [id]);
    return rows[0] || null;
  } catch (e) {
    throw new Error('getType error: ' + e.message);
  }
}

async function createType({ code, name, enabled = true, scheduleRule, durationMinutes = 120 }) {
  try {
    const schedule_weekday = scheduleRule?.weekday ?? null;
    const schedule_time = scheduleRule?.time ? `${scheduleRule.time}:00` : null;
    const res = await exec(
      'INSERT INTO activity_types (code, name, enabled, schedule_weekday, schedule_time, duration_minutes) VALUES (?,?,?,?,?,?)',
      [code, name, enabled ? 1 : 0, schedule_weekday, schedule_time, durationMinutes]
    );
    return getType(res.insertId);
  } catch (e) {
    throw new Error('createType error: ' + e.message);
  }
}

async function updateType(id, data) {
  try {
    const exists = await getType(id);
    if (!exists) return null;
    const code = data.code ?? exists.code;
    const name = data.name ?? exists.name;
    const enabled = data.enabled != null ? (data.enabled ? 1 : 0) : exists.enabled;
    const schedule_weekday = data.scheduleRule?.weekday ?? exists.schedule_weekday;
    const schedule_time = data.scheduleRule?.time != null ? `${data.scheduleRule.time}:00` : exists.schedule_time;
    const duration_minutes = data.durationMinutes ?? exists.duration_minutes;
    await exec(
      'UPDATE activity_types SET code=?, name=?, enabled=?, schedule_weekday=?, schedule_time=?, duration_minutes=? WHERE id=?',
      [code, name, enabled, schedule_weekday, schedule_time, duration_minutes, id]
    );
    return getType(id);
  } catch (e) {
    throw new Error('updateType error: ' + e.message);
  }
}

async function deleteType(id) {
  try {
    await exec('DELETE FROM activity_types WHERE id=?', [id]);
  } catch (e) {
    throw new Error('deleteType error: ' + e.message);
  }
}

module.exports = { listTypes, getType, createType, updateType, deleteType };


