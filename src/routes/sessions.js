const Router = require("@koa/router");
const { authMiddleware } = require("../utils/auth");
const { ok, created, notFound, badRequest } = require("../utils/res");
const Sessions = require("../dao/sessions");
const Parts = require("../dao/participations");

module.exports = (router, prefix = "") => {
  const base = `${prefix}/api/v1/sessions`;
  const sub = new Router();

  // GET /sessions
  sub.get("/", authMiddleware(), async (ctx) => {
    const { typeId, from, to, page = 1, pageSize = 20 } = ctx.query;
    const limit = Number(pageSize) || 20;
    const offset = (Number(page) - 1) * limit;
    const data = await Sessions.listSessions({
      typeId,
      from,
      to,
      limit,
      offset,
    });
    return ok(ctx, data);
  });

  // POST /sessions
  sub.post("/", authMiddleware(), async (ctx) => {
    const body = ctx.request.body || {};
    const { typeId, name, startAt, endAt } = body;
    if (!typeId || !name || !startAt || !endAt)
      return badRequest(ctx, "缺少必要字段");
    try {
      const s = await Sessions.createSession(body, ctx.state.user?.id);
      return created(ctx, s);
    } catch (e) {
      console.error("createSession error:", e);
      throw e;
    }
  });

  // GET /sessions/:id
  sub.get("/:id", authMiddleware(), async (ctx) => {
    const s = await Sessions.getSession(ctx.params.id);
    if (!s) return notFound(ctx);
    return ok(ctx, s);
  });

  // PUT /sessions/:id
  sub.put("/:id", authMiddleware(), async (ctx) => {
    const s = await Sessions.updateSession(
      ctx.params.id,
      ctx.request.body || {}
    );
    if (!s) return notFound(ctx);
    return ok(ctx, s);
  });

  // DELETE /sessions/:id
  sub.delete("/:id", authMiddleware(), async (ctx) => {
    await Sessions.deleteSession(ctx.params.id);
    ctx.status = 204;
  });

  // GET /sessions/:id/participations
  sub.get("/:id/participations", authMiddleware(), async (ctx) => {
    const items = await Parts.listBySession(ctx.params.id);
    return ok(ctx, items);
  });

  // POST /sessions/:id/participations
  sub.post("/:id/participations", authMiddleware(), async (ctx) => {
    const item = await Parts.createOne(
      ctx.params.id,
      ctx.request.body || {},
      ctx.state.user?.id
    );
    return created(ctx, item);
  });

  // PUT /sessions/:id/participations/:pid
  sub.put("/:id/participations/:pid", authMiddleware(), async (ctx) => {
    const updated = await Parts.updateOne(
      ctx.params.id,
      ctx.params.pid,
      ctx.request.body || {},
      ctx.state.user?.id
    );
    if (!updated) return notFound(ctx);
    return ok(ctx, updated);
  });

  // DELETE /sessions/:id/participations/:pid
  sub.delete("/:id/participations/:pid", authMiddleware(), async (ctx) => {
    await Parts.deleteOne(ctx.params.id, ctx.params.pid);
    ctx.status = 204;
  });

  // POST /sessions/:id/participations/bulk-upsert
  sub.post("/:id/participations/bulk-upsert", authMiddleware(), async (ctx) => {
    console.log("bulkUpsert", ctx.request.body);
    try{
      const items = await Parts.bulkUpsert(
        ctx.params.id,
        ctx.request.body || [],
        ctx.state.user?.id
      );
      return ok(ctx, items);
    } catch (e) {
      console.error("bulkUpsert error:", e);
      throw e;
    }
  });

  router.use(base, sub.routes(), sub.allowedMethods());
};
