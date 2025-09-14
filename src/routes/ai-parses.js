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
const { uploadFile, getPresignedUrl } = require('../utils/minio');

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

function normalizeWorkflowEndpoint(endpoint) {
	try {
		const u = new URL(endpoint);
		const p = (u.pathname || '').replace(/\/+$/, '');
		if (/\/workflows\/run$/.test(p) || /\/workflows\/[^/]+\/run$/.test(p)) {
			return u.toString();
		}
		u.pathname = `${p}/workflows/run`;
		return u.toString();
	} catch (_) {
		return `${endpoint}`.replace(/\/+$/, '') + '/workflows/run';
	}
}

async function triggerRemoteWorkflow(job, endpoint, apiKey, options) {
	// 调用 Dify Workflow API，按官方文档仅传递允许字段
	if (!endpoint) return;
	const finalEndpoint = normalizeWorkflowEndpoint(endpoint);
	const f = global.fetch || (await import('node-fetch')).default;
	const fileVar = options?.fileVarName || 'images';
	const responseMode = options?.responseMode || 'blocking';
	const user = options?.user || 'web-user';
	const inputs ={}

	// 文件变量为数组：仅包含 type / transfer_method / url 三个字段
	const imageFile = {
		type: 'image',
		transfer_method: 'remote_url',
		url: options?.absoluteImageUrl,
	};

	// 仅设置用户声明的变量名，不注入未定义的自定义变量
	inputs[fileVar] = imageFile
	inputs.job_id = String(job.id);

	const body = { inputs, response_mode: responseMode, user };
	const headers = { 'content-type': 'application/json' };
	if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;


	try {
		const res = await f(finalEndpoint, { method: 'POST', headers, body: JSON.stringify(body) });
		let text = '';
		try { text = await res.text(); } catch {}
		console.log('[AI] Trigger done(JSON)', { jobId: job.id, status: res.status, ok: res.ok, body: (text || '').slice(0, 800) });

		if (!res.ok) {
			await dao.updateStatusAndData(job.id, { status: 'failed', error: (text || 'Dify 调用失败') }, ['queued', 'processing']);
			return;
		}

		// 尝试根据返回类型更新状态
		const contentType = (res.headers && typeof res.headers.get === 'function') ? (res.headers.get('content-type') || '') : '';
		if (responseMode === 'blocking' && contentType.includes('application/json')) {
			try {
				const json = text ? JSON.parse(text) : {};
				console.log('json',json)
				const workflowRunId = json.workflow_run_id || json.id || null;
				const taskId = json.task_id || null;
				const dataObj = json.data || null;
				const status = (dataObj && dataObj.status) || null;
				const outputs = (dataObj && dataObj.outputs) || null;
				const patch = { aiTraceId: workflowRunId, data: Object.assign({}, dataObj || {}, { workflow_run_id: workflowRunId, task_id: taskId }) };
				if (status === 'succeeded' || status === 'failed' || status === 'stopped') {
					patch.status = status;
					if (outputs) patch.outputs = outputs;
				}
				await dao.updateStatusAndData(job.id, patch, ['queued', 'processing']);
			} catch (e) {
				console.warn('[AI] Blocking response parse failed', { jobId: job.id, message: e?.message });
				// 无法解析则仅标记为 processing，但保存可用的 run id/task id
				try {
					const fallback = text ? JSON.parse(text) : {};
					await dao.updateStatusAndData(job.id, { aiTraceId: fallback.workflow_run_id || null, data: fallback, status: 'processing' }, ['queued', 'processing']);
				} catch (_) {}
			}
		} else {
			// 流式或未知内容类型：尽力提取 run id / task id
			try {
				const maybe = text ? JSON.parse(text) : {};
				await dao.updateStatusAndData(job.id, { aiTraceId: maybe.workflow_run_id || null, data: maybe, status: 'processing' }, ['queued', 'processing']);
			} catch (_) {
				await dao.updateStatusAndData(job.id, { status: 'processing' }, ['queued', 'processing']);
			}
		}
	} catch (e) {
		console.error('[AI] Trigger error(JSON)', { jobId: job?.id, message: e?.message });
		await dao.updateStatusAndData(job.id, { status: 'failed', error: e?.message || 'Dify 调用异常' }, ['queued', 'processing']).catch(() => {});
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
				
				// 生成 MinIO 对象名称（按日期分类存储）
				const date = new Date();
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, '0');
				const day = String(date.getDate()).padStart(2, '0');
				const objectName = `images/${year}/${month}/${day}/${filename}`;
				
				// 先保存到本地临时文件，然后上传到 MinIO
				const tempPath = path.join(UPLOAD_DIR, filename);
				fs.writeFileSync(tempPath, buffer);
				
				try {
					// 上传到 MinIO
					await uploadFile(tempPath, objectName, mime);
					
					// 上传成功后删除临时文件
					fs.unlinkSync(tempPath);
					
					const callbackToken = crypto.randomBytes(24).toString('hex');
					const rid = request_id ? `${request_id}#${i}` : null;
										// 获取 MinIO 预签名 URL 或使用公网地址
										let absoluteImageUrl;
										if (config.appBaseUrl.includes('localhost') || config.appBaseUrl.includes('127.0.0.1')) {
											// 本地环境，使用 MinIO 预签名 URL
											absoluteImageUrl = await getPresignedUrl(objectName, 24 * 60 * 60); // 24小时有效期
										} else {
											// 生产环境，使用公网地址
											absoluteImageUrl = `http://${config.minio.endPoint}:${config.minio.port}/${config.minio.bucketName}/${encodeURIComponent(objectName)}`;
										}
					const job = {
						sessionId,
						requestId: rid,
						imageUrl: absoluteImageUrl, // 存储 MinIO 对象名称
						imagePath: objectName, // 存储 MinIO 对象名称
						mime,
						sizeBytes: buffer.length,
						contentSha256: sha256,
						status: 'queued',
						callbackToken,
					};
					const id = await dao.insertJob(job);
					await dao.setProcessing(id).catch(() => {});
					

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
						fileVarName, 
						responseMode, 
						user 
					}).catch(() => {});
					results.push({ id, status: 'queued', createdAt: nowIso, url: objectName });
				} catch (uploadError) {
					// 如果 MinIO 上传失败，回退到本地存储
					console.log('config',config)
					console.error('MinIO upload failed, falling back to local storage:', uploadError);
					
					// 删除临时文件
					if (fs.existsSync(tempPath)) {
						fs.unlinkSync(tempPath);
					}
					
					// 使用本地存储
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


