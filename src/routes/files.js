const { getPresignedUrl, fileExists } = require('../utils/minio');
const { badRequest, notFound, internal } = require('../utils/res');

module.exports = (router, prefix = '') => {
	// 获取文件（通过 MinIO 预签名 URL 或直接下载）
	router.get(`${prefix}/api/v1/files/(.*)`, async (ctx) => {
		try {
			const objectName = ctx.params[0]; // 获取路径参数
			if (!objectName) {
				return badRequest(ctx, '缺少文件路径');
			}

			// 检查文件是否存在
			const exists = await fileExists(objectName);
			if (!exists) {
				return notFound(ctx, '文件不存在');
			}

			// 生成预签名 URL 并重定向
			const presignedUrl = await getPresignedUrl(objectName, 3600); // 1小时有效期
			ctx.redirect(presignedUrl);
		} catch (error) {
			console.error('Error serving file:', error);
			return internal(ctx, '获取文件失败');
		}
	});

	// 获取文件信息
	router.head(`${prefix}/api/v1/files/(.*)`, async (ctx) => {
		try {
			const objectName = ctx.params[0];
			if (!objectName) {
				return badRequest(ctx, '缺少文件路径');
			}

			// 检查文件是否存在
			const exists = await fileExists(objectName);
			if (!exists) {
				return notFound(ctx, '文件不存在');
			}

			// 返回文件信息（这里可以添加更多文件元数据）
			ctx.status = 200;
			ctx.set('X-File-Exists', 'true');
		} catch (error) {
			console.error('Error checking file:', error);
			return internal(ctx, '检查文件失败');
		}
	});
};
