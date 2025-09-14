const db = require('../db');

async function insertJob(job) {
	const sql = `
		INSERT INTO ai_parse_jobs
		(session_id, request_id, image_url, image_path, mime, size_bytes, content_sha256, status, data, error, ai_trace_id, callback_token)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`;
	const params = [
		job.sessionId,
		job.requestId || null,
		job.imageUrl || null,
		job.imagePath || null,
		job.mime || null,
		job.sizeBytes || null,
		job.contentSha256 || null,
		job.status || 'queued',
		job.data ? JSON.stringify(job.data) : null,
		job.error || null,
		job.aiTraceId || null,
		job.callbackToken,
	];
	const res = await db.exec(sql, params);
	return res.insertId;
}

async function findById(id) {
	const rows = await db.query('SELECT * FROM ai_parse_jobs WHERE id = ?', [id]);
	return rows[0] || null;
}

async function findByRequestId(requestId) {
	if (!requestId) return null;
	const rows = await db.query('SELECT * FROM ai_parse_jobs WHERE request_id = ?', [requestId]);
	return rows[0] || null;
}

async function listBySession(sessionId, { page = 1, pageSize = 20 } = {}) {
	const limit = Math.max(1, Math.min(100, Number(pageSize)));
	const offset = (Math.max(1, Number(page)) - 1) * limit;
	const items = await db.query(
		'SELECT * FROM ai_parse_jobs WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
		[sessionId, limit, offset]
	);
	const totalRows = await db.query('SELECT COUNT(1) AS c FROM ai_parse_jobs WHERE session_id = ?', [sessionId]);
	return { items, total: totalRows[0]?.c || 0 };
}

async function updateStatusAndData(id, updates, allowedFromStatuses = ['queued', 'processing']) {
	const fields = [];
	const params = [];
	if (updates.status) { fields.push('status = ?'); params.push(updates.status); }
	if (Object.prototype.hasOwnProperty.call(updates, 'data')) { fields.push('data = ?'); params.push(updates.data.outputs.result || null); }
	if (Object.prototype.hasOwnProperty.call(updates, 'error')) { fields.push('error = ?'); params.push(updates.error || null); }
	if (updates.aiTraceId) { fields.push('ai_trace_id = ?'); params.push(updates.aiTraceId); }
	fields.push('version = version + 1');
	const sql = `UPDATE ai_parse_jobs SET ${fields.join(', ')} WHERE id = ? AND status IN (${allowedFromStatuses.map(() => '?').join(',')})`;
	params.push(id, ...allowedFromStatuses);
	const res = await db.exec(sql, params);
	return res.affectedRows > 0;
}

async function setProcessing(id) {
	return updateStatusAndData(id, { status: 'processing' }, ['queued']);
}

module.exports = {
	insertJob,
	findById,
	findByRequestId,
	listBySession,
	updateStatusAndData,
	setProcessing,
};


