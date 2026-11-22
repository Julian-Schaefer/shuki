import { and, eq, file, paper, paperContent } from "@shuki/db";
import { storageKeys } from "@shuki/storage";
import type { WorkerContext } from "../context";
import { fetchImage } from "./fetch-page";

const THUMBNAIL_WIDTH = 480;

/**
 * Renders the first page of a PDF as JPEG. mupdf (WebAssembly) is loaded on
 * first use so workers that never see a PDF don't pay for it.
 */
export async function renderPdfThumbnail(pdf: Uint8Array): Promise<Uint8Array> {
  const mupdf = await import("mupdf");
  const document = mupdf.Document.openDocument(pdf, "application/pdf");
  try {
    const page = document.loadPage(0);
    const [x0, , x1] = page.getBounds();
    const scale = THUMBNAIL_WIDTH / Math.max(1, x1 - x0);
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    const jpeg = pixmap.asJPEG(80);
    pixmap.destroy();
    page.destroy();
    return jpeg;
  } finally {
    document.destroy();
  }
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Creates the preview image of a paper: the first page of its PDF, or the
 * website's preview image (downloaded once, so cards never hotlink).
 * Returns false when the paper has nothing to show.
 */
export async function generateThumbnail(ctx: WorkerContext, paperId: string): Promise<boolean> {
  const { db, storage, env } = ctx;
  const current = await db.query.paper.findFirst({
    where: eq(paper.id, paperId),
    columns: { id: true, userId: true },
  });
  if (!current) return false;

  let image: { body: Uint8Array; contentType: string } | null = null;

  const [pdf] = await db
    .select({ storageKey: file.storageKey })
    .from(file)
    .where(and(eq(file.paperId, paperId), eq(file.mimeType, "application/pdf")))
    .limit(1);
  if (pdf) {
    const object = await storage.get(pdf.storageKey);
    image = {
      body: await renderPdfThumbnail(await readAll(object.body)),
      contentType: "image/jpeg",
    };
  } else {
    const [content] = await db
      .select({ imageUrl: paperContent.imageUrl })
      .from(paperContent)
      .where(eq(paperContent.paperId, paperId));
    if (content?.imageUrl) {
      image = await fetchImage(content.imageUrl, {
        allowPrivateNetworks: env.CLIPPER_ALLOW_PRIVATE_NETWORKS,
      });
    }
  }
  if (!image) return false;

  await storage.put({
    key: storageKeys.paperThumbnail(current.userId, paperId),
    body: image.body,
    contentType: image.contentType,
  });
  await db.update(paper).set({ thumbnailAt: new Date() }).where(eq(paper.id, paperId));
  return true;
}

/** Thumbnail generation must never fail the surrounding job. */
export async function tryGenerateThumbnail(ctx: WorkerContext, paperId: string): Promise<void> {
  try {
    await generateThumbnail(ctx, paperId);
  } catch (error) {
    console.warn(
      `[thumbnail] paper ${paperId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
