import { createHash, randomUUID } from "node:crypto";
import { and, eq, file, ne, paper, paperContent } from "@shuki/db";
import type { JobHandler } from "@shuki/jobs";
import { storageKeys } from "@shuki/storage";
import type { WorkerContext } from "../context";
import { extractArticle } from "../lib/extract-article";
import { fetchPage, PermanentFetchError } from "../lib/fetch-page";
import { markProcessing, recordFailure } from "../lib/paper-status";
import { tryGenerateThumbnail } from "../lib/thumbnail";

/**
 * `paper.clip-url`: saves a website. Fetches the page, extracts a sanitized
 * reader view, plain text and metadata. A URL that serves a PDF is stored as
 * the paper's PDF instead.
 */
export const createClipUrlHandler =
  (ctx: WorkerContext): JobHandler<"paper.clip-url"> =>
  async ({ paperId, replaceTitle }, job) => {
    const { db, storage, env } = ctx;
    if (!(await markProcessing(db, paperId))) return;
    const current = await db.query.paper.findFirst({ where: eq(paper.id, paperId) });
    if (!current?.url) {
      await recordFailure(db, {
        paperId,
        queue: "paper.clip-url",
        job,
        error: new Error("This paper has no URL to fetch"),
        permanent: true,
      });
      return;
    }

    try {
      const page = await fetchPage(current.url, {
        allowPrivateNetworks: env.CLIPPER_ALLOW_PRIVATE_NETWORKS,
      });

      if (page.kind === "pdf") {
        const fileId = randomUUID();
        const storageKey = storageKeys.paperFile(current.userId, paperId, fileId);
        const fileName =
          decodeURIComponent(new URL(page.finalUrl).pathname.split("/").pop() || "document") +
          (page.finalUrl.toLowerCase().endsWith(".pdf") ? "" : ".pdf");
        await storage.put({ key: storageKey, body: page.body, contentType: "application/pdf" });
        await db.insert(file).values({
          id: fileId,
          userId: current.userId,
          paperId,
          storageKey,
          fileName,
          mimeType: "application/pdf",
          size: page.body.byteLength,
          sha256: createHash("sha256").update(page.body).digest("hex"),
        });
        await tryGenerateThumbnail(ctx, paperId);
        await db
          .update(paper)
          .set({
            sourceType: "pdf",
            title: replaceTitle ? fileName.replace(/\.pdf$/i, "") : undefined,
            status: "ready",
            error: null,
          })
          .where(eq(paper.id, paperId));
        console.log(`[paper.clip-url] paper ${paperId}: stored PDF from ${page.finalUrl}`);
        return;
      }

      const article = extractArticle(page.html, page.finalUrl);
      const content = {
        content: article.text,
        html: article.html,
        imageUrl: article.imageUrl,
        embeddable: page.embeddable,
      };
      await db
        .insert(paperContent)
        .values({ paperId, ...content })
        .onConflictDoUpdate({ target: paperContent.paperId, set: content });

      await tryGenerateThumbnail(ctx, paperId);

      // A DOI is unique per user – skip it if another paper already has it.
      const doiTaken =
        article.doi &&
        (await db.query.paper.findFirst({
          where: and(
            eq(paper.userId, current.userId),
            eq(paper.doi, article.doi),
            ne(paper.id, paperId),
          ),
          columns: { id: true },
        }));

      await db
        .update(paper)
        .set({
          title: replaceTitle && article.title ? article.title : undefined,
          abstract: current.abstract ?? article.description,
          venue: current.venue ?? article.siteName,
          authors: current.authors.length ? undefined : article.authors,
          year: current.year ?? article.year,
          doi: current.doi ?? (doiTaken ? undefined : article.doi),
          status: "ready",
          error: null,
        })
        .where(eq(paper.id, paperId));
      console.log(`[paper.clip-url] paper ${paperId}: saved ${page.finalUrl}`);
    } catch (error) {
      const retry = await recordFailure(db, {
        paperId,
        queue: "paper.clip-url",
        job,
        error,
        permanent: error instanceof PermanentFetchError,
      });
      if (retry) throw error;
    }
  };
