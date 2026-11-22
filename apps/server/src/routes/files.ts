import { createHash, randomUUID } from "node:crypto";
import { and, eq, file, paper } from "@shuki/db";
import { enqueue } from "@shuki/jobs";
import { storageKeys } from "@shuki/storage";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../app";

const ALLOWED_MIME_TYPES = new Set(["application/pdf"]);

/** Computes size and SHA-256 while streaming; aborts once the size limit is exceeded. */
function meteredStream(body: ReadableStream<Uint8Array>, maxBytes: number) {
  const hash = createHash("sha256");
  let size = 0;
  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > maxBytes) {
          controller.error(new HTTPException(413, { message: "File too large" }));
          return;
        }
        hash.update(chunk);
        controller.enqueue(chunk);
      },
    }),
  );
  return { stream, result: () => ({ size, sha256: hash.digest("hex") }) };
}

export const filesRoutes = new Hono<AppEnv>()
  /** Raw body (no multipart) so it streams straight to S3; file name in `X-File-Name`. */
  .put("/papers/:paperId/file", async (c) => {
    const user = c.get("user");
    if (!user) throw new HTTPException(401);
    const { env, db, storage, boss } = c.get("services");

    const paperId = c.req.param("paperId");
    const contentType = c.req.header("content-type")?.split(";")[0]?.trim() ?? "";
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      throw new HTTPException(415, { message: "Only PDF files are supported" });
    }
    const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
    const declaredSize = Number(c.req.header("content-length") ?? 0);
    if (declaredSize > maxBytes) throw new HTTPException(413, { message: "File too large" });

    const body = c.req.raw.body;
    if (!body) throw new HTTPException(400, { message: "Missing request body" });

    const owned = await db.query.paper.findFirst({
      where: and(eq(paper.id, paperId), eq(paper.userId, user.id)),
      columns: { id: true },
    });
    if (!owned) throw new HTTPException(404);

    const fileId = randomUUID();
    const storageKey = storageKeys.paperFile(user.id, paperId, fileId);
    const fileName = decodeURIComponent(c.req.header("x-file-name") ?? "upload.pdf").slice(0, 255);

    const metered = meteredStream(body, maxBytes);
    await storage.put({ key: storageKey, body: metered.stream, contentType });
    const { size, sha256 } = metered.result();

    await db.transaction(async (tx) => {
      await tx.insert(file).values({
        id: fileId,
        userId: user.id,
        paperId,
        storageKey,
        fileName,
        mimeType: contentType,
        size,
        sha256,
      });
      await tx
        .update(paper)
        .set({ sourceType: "pdf", status: "pending", error: null })
        .where(eq(paper.id, paperId));
    });
    await enqueue(boss, "paper.process", { paperId });

    return c.json({ id: fileId, size, sha256 }, 201);
  })

  .get("/papers/:paperId/thumbnail", async (c) => {
    const user = c.get("user");
    if (!user) throw new HTTPException(401);
    const { db, storage } = c.get("services");

    const found = await db.query.paper.findFirst({
      where: and(eq(paper.id, c.req.param("paperId")), eq(paper.userId, user.id)),
      columns: { id: true, thumbnailAt: true },
    });
    if (!found?.thumbnailAt) throw new HTTPException(404);

    const object = await storage.get(storageKeys.paperThumbnail(user.id, found.id));
    return new Response(object.body, {
      headers: {
        "Content-Type": object.contentType ?? "image/jpeg",
        ...(object.contentLength ? { "Content-Length": String(object.contentLength) } : {}),
        // The URL carries ?v=<thumbnailAt>, so it can be cached for long.
        "Cache-Control": "private, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  })

  .get("/files/:fileId", async (c) => {
    const user = c.get("user");
    if (!user) throw new HTTPException(401);
    const { db, storage } = c.get("services");

    const found = await db.query.file.findFirst({
      where: and(eq(file.id, c.req.param("fileId")), eq(file.userId, user.id)),
    });
    if (!found) throw new HTTPException(404);

    const object = await storage.get(found.storageKey);
    const disposition = c.req.query("download") === "1" ? "attachment" : "inline";
    return new Response(object.body, {
      headers: {
        "Content-Type": found.mimeType,
        "Content-Length": String(found.size),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(found.fileName)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  });
