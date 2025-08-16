const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { ok, created, badRequest, notFound, conflict, internal, forbidden } = require('../utils/res');
const { authMiddleware } = require('../utils/auth');
const dao = require('../dao/ai-parses');
const { koaBody } = require('koa-body');
const FormData = require('form-data');
const { log } = require('console');
const config = require('../../config/default');

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB per file
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg']);
const PUBLIC_DIR = path.join(__dirname, '../../public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');

function ensureUploadDir() {
	if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
	if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
}

function computeSha256(buffer) {
	return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hmacSign(bodyString, timestamp, secret) {
	return crypto.createHmac('sha256', secret).update(`${bodyString}.${timestamp}`).digest('hex');
}

function safeParseJson(text) {
	if (!text || typeof text !== 'string') return undefined;
	try { return JSON.parse(text); } catch { return undefined; }
}

async function triggerRemoteWorkflow(job, endpoint, apiKey, options) {
	// JSON call for Dify workflow execute API using remote_url image
	if (!endpoint) return;
	const f = global.fetch || (await import('node-fetch')).default;
	const APP_BASE = config.appBaseUrl.replace(/\/$/, '');
	const fileVar = options?.fileVarName || 'images';
	const responseMode = options?.responseMode || 'blocking';
	const user = options?.user || 'web-user';
	const inputs = Object.assign({}, options?.workflowInputs || {});
	
	// 根据官方文档，文件类型变量应该是列表格式
	// 每个元素包含：type, transfer_method, url 等字段
	const imageFile = {
		type: 'image',
		transfer_method: 'remote_url',
		url: options?.absoluteImageUrl,
		filename: job.filename || 'image.jpg',
		size: job.sizeBytes || 0
	};
	
	// 设置 absoluteImageUrl 字段为文件对象列表
	inputs.absoluteImageUrl = [imageFile];
	
	// 同时保持原有的文件数组格式以兼容其他工作流
	const filesArray = Array.isArray(inputs[fileVar]) ? inputs[fileVar] : [];
	filesArray.push(imageFile);
	inputs[fileVar] = filesArray;
	inputs.job_id = job.id;
	inputs.callback_url = `${APP_BASE}/api/v1/ai-parses/callback`;
	const body = { inputs, response_mode: responseMode, user };
	const headers = { 'content-type': 'application/json' };
	if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
	console.log('[AI] Trigger start(JSON)', { 
		endpoint, 
		jobId: job.id, 
		fileVar, 
		absoluteImageUrl: options?.absoluteImageUrl, 
		inputs,
		body: JSON.stringify(body, null, 2)
	});
	try {
		const res = await f(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
		let text = '';
		try { text = await res.text(); } catch {}
		console.log('[AI] Trigger done(JSON)', { jobId: job.id, status: res.status, ok: res.ok, body: (text || '').slice(0, 800) });
		if (res.ok) {
			try {
				const json = text ? JSON.parse(text) : {};
				const workflowRunId = json.workflow_run_id || json.id || null;
				const taskId = json.task_id || null;
				const dataPatch = Object.assign({}, { workflow_run_id: workflowRunId, task_id: taskId });
				await dao.updateStatusAndData(job.id, { aiTraceId: workflowRunId, data: dataPatch }, ['queued', 'processing']);
			} catch (e) {
				console.warn('[AI] Response parse failed', { jobId: job.id, message: e?.message });
			}
		}
	} catch (e) {
		console.error('[AI] Trigger error(JSON)', { jobId: job?.id, message: e?.message });
	}
}

module.exports = (router, prefix = '') => {
	// Create parse jobs via multipart - require auth
	router.post(`${prefix}/api/v1/sessions/:sessionId/parses`, authMiddleware(), koaBody({ multipart: true, formidable: { multiples: true, maxFileSize: MAX_FILE_BYTES } }), async (ctx) => {
		try {
			ensureUploadDir();
			const { request_id, workflow_url, workflow_api_key } = ctx.request.body || {};
			try {
				const u = new URL(workflow_url);
				if (u.protocol !== 'http:' && u.protocol !== 'https:') return badRequest(ctx, 'workflow_url 必须是 http/https');
			} catch {
				return badRequest(ctx, '缺少或无效的 workflow_url');
			}
			if (!workflow_api_key) return badRequest(ctx, '缺少 workflow_api_key');
			const sessionId = Number(ctx.params.sessionId);
			if (!Number.isFinite(sessionId)) return badRequest(ctx, '无效的 sessionId');
			let files = ctx.request.files ? ctx.request.files.file : null;
			if (!files) return badRequest(ctx, '缺少文件字段 file');
			files = Array.isArray(files) ? files : [files];
			if (files.length === 0) return badRequest(ctx, '未接收到文件');

			const nowIso = new Date().toISOString();
			const results = [];
			for (let i = 0; i < files.length; i += 1) {
				const f = files[i];
				const mime = f.mimetype || f.type;
				if (!ALLOWED_MIME.has(mime)) return badRequest(ctx, `第 ${i + 1} 个文件类型不支持`);
				const srcPath = f.filepath || f.path;
				const stat = fs.statSync(srcPath);
				if (stat.size > MAX_FILE_BYTES) return resTooLarge(ctx, `第 ${i + 1} 个文件体积过大`);

				const buffer = fs.readFileSync(srcPath);
				const sha256 = computeSha256(buffer);
				const ext = mime === 'image/png' ? '.png' : '.jpg';
				const filename = `${Date.now()}-${sha256.slice(0, 8)}${ext}`;
				const targetPath = path.join(UPLOAD_DIR, filename);
				fs.writeFileSync(targetPath, buffer);

				const callbackToken = crypto.randomBytes(24).toString('hex');
				const rid = request_id ? `${request_id}#${i}` : null;
				const job = {
					sessionId,
					requestId: rid,
					imageUrl: `/uploads/${filename}`,
					imagePath: targetPath,
					mime,
					sizeBytes: buffer.length,
					contentSha256: sha256,
					status: 'queued',
					callbackToken,
				};
				const id = await dao.insertJob(job);
				await dao.setProcessing(id).catch(() => {});
				const APP_BASE = config.appBaseUrl.replace(/\/$/, '');
				const absoluteImageUrl = `${APP_BASE}/uploads/${filename}`;
				const workflowInputs = safeParseJson(ctx.request.body?.workflow_inputs);
				const fileVarName = ctx.request.body?.workflow_file_var || 'images';
				const responseMode = ctx.request.body?.workflow_response_mode || 'blocking';
				const user = ctx.request.body?.workflow_user || 'web-user';
				triggerRemoteWorkflow({ 
					id, 
					filename, 
					mime, 
					sizeBytes: buffer.length,
					contentSha256: sha256
				}, workflow_url, workflow_api_key, { 
					absoluteImageUrl, 
					workflowInputs, 
					fileVarName, 
					responseMode, 
					user 
				}).catch(() => {});
				results.push({ id, status: 'queued', createdAt: nowIso, url: `/uploads/${filename}` });
			}

			if (results.length === 1) return created(ctx, results[0]);
			return created(ctx, { items: results, total: results.length });
		} catch (e) {
			return internal(ctx, e.message || '服务器错误');
		}
	});

	// List parses by session - require auth
	router.get(`${prefix}/api/v1/sessions/:sessionId/parses`, authMiddleware(), async (ctx) => {
		const sessionId = Number(ctx.params.sessionId);
		if (!Number.isFinite(sessionId)) return badRequest(ctx, '无效的 sessionId');
		const page = Number(ctx.query.page || 1);
		const pageSize = Number(ctx.query.pageSize || 20);
		const { items, total } = await dao.listBySession(sessionId, { page, pageSize });
		const mapped = items.map(r => ({
			id: r.id,
			status: r.status,
			url: r.image_url,
			mime: r.mime,
			data: typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || null),
			error: r.error || null,
			createdAt: r.created_at,
			updatedAt: r.updated_at,
		}));
		return ok(ctx, { items: mapped, total });
	});

	// Cancel a parse job - require auth
	router.delete(`${prefix}/api/v1/ai-parses/:id`, authMiddleware(), async (ctx) => {
		const id = Number(ctx.params.id);
		if (!Number.isFinite(id)) return badRequest(ctx, '无效的 id');
		const job = await dao.findById(id);
		if (!job) return notFound(ctx, '记录不存在');
		if (['succeeded', 'failed', 'canceled', 'timeout'].includes(job.status)) {
			return conflict(ctx, '该任务已是终态，无法取消');
		}
		const { cancel_url, workflow_api_key } = ctx.request.body || {};
		if (cancel_url) {
			try {
				const u = new URL(cancel_url);
				if (u.protocol === 'http:' || u.protocol === 'https:') {
					const f = global.fetch || (await import('node-fetch')).default;
					await f(cancel_url, {
						method: 'POST',
						headers: { 'content-type': 'application/json', ...(workflow_api_key ? { Authorization: `Bearer ${workflow_api_key}` } : {}) },
						body: JSON.stringify({ job_id: id }),
					});
				}
			} catch (_) {
				// ignore remote cancel errors
			}
		}
		const okUpdate = await dao.updateStatusAndData(id, { status: 'canceled' }, ['queued', 'processing']);
		if (!okUpdate) return conflict(ctx, '状态不可更新');
		return ok(ctx, { id, status: 'canceled' });
	});

	// Get job status - require auth
	router.get(`${prefix}/api/v1/ai-parses/:id`, authMiddleware(), async (ctx) => {
		const id = Number(ctx.params.id);
		if (!Number.isFinite(id)) return badRequest(ctx, '无效的 id');
		const job = await dao.findById(id);
		if (!job) return notFound(ctx, '记录不存在');
		return ok(ctx, {
			id: job.id,
			status: job.status,
			data: typeof job.data === 'string' ? JSON.parse(job.data) : (job.data || null),
			error: job.error || null,
			updatedAt: job.updated_at,
		});
	});

	// Callback - no signature for now
	router.post(`${prefix}/api/v1/ai-parses/callback`, async (ctx) => {
		const { id, status, data, error, ai_trace_id } = ctx.request.body || {};
		if (!id || !status) return badRequest(ctx, '缺少必要字段');
		const job = await dao.findById(id);
		if (!job) return notFound(ctx, '记录不存在');
		const okUpdate = await dao.updateStatusAndData(id, { status, data, error, aiTraceId: ai_trace_id }, ['queued', 'processing']);
		if (!okUpdate) return conflict(ctx, '状态不可更新');
		return ok(ctx, { ok: true });
	});
};

function resTooLarge(ctx, message) {
	ctx.status = 413;
	ctx.body = { error: { code: 'PAYLOAD_TOO_LARGE', message } };
}


