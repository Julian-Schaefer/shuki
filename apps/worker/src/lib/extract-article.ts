import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import sanitizeHtml from "sanitize-html";

export type ExtractedArticle = {
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
  authors: { name: string }[];
  doi: string | null;
  year: number | null;
  /** Sanitized reader-view HTML. */
  html: string;
  /** Plain text for full-text search. */
  text: string;
};

const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() || null;

function absolutize(value: string, base: string): string | null {
  try {
    return new URL(value, base).href;
  } catch {
    return null;
  }
}

/** Reader-view HTML may only contain harmless markup – no scripts, styles, frames or forms. */
function sanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "figure",
      "figcaption",
      "picture",
      "source",
      "h1",
      "h2",
      "sup",
      "sub",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "srcset", "alt", "title", "width", "height"],
      source: ["srcset", "type", "media"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    transformTags: {
      // In-page anchors (footnotes, TOC) point nowhere in the reader view – keep just the text.
      a: (tagName, attribs) =>
        !attribs.href || attribs.href.startsWith("#")
          ? { tagName: "span", attribs: {} }
          : {
              tagName,
              attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
            },
    },
  });
}

/** First reasonably large image of the article – fallback when a page has no og:image. */
function firstContentImage(html: string, url: string): string | null {
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = tag.match(/\ssrc="([^"]+)"/i)?.[1];
    if (!src || src.startsWith("data:")) continue;
    const width = Number(tag.match(/\swidth="(\d+)"/i)?.[1] ?? 0);
    if (width && width < 120) continue; // icons, badges, tracking pixels
    return absolutize(src.replace(/&amp;/g, "&"), url);
  }
  return null;
}

/** Extracts a readable article plus metadata (Open Graph, Highwire `citation_*`) from HTML. */
export function extractArticle(html: string, url: string): ExtractedArticle {
  const { document } = parseHTML(html);

  // Make links and images absolute so the reader view works outside the original site.
  for (const element of document.querySelectorAll("[href], [src], [srcset]")) {
    for (const attribute of ["href", "src"]) {
      const value = element.getAttribute(attribute);
      if (value && !value.startsWith("#")) {
        const absolute = absolutize(value, url);
        if (absolute) element.setAttribute(attribute, absolute);
      }
    }
    const srcset = element.getAttribute("srcset");
    if (srcset) {
      element.setAttribute(
        "srcset",
        srcset
          .split(",")
          .map((candidate: string) => {
            const [src, ...descriptor] = candidate.trim().split(/\s+/);
            return [src ? absolutize(src, url) : null, ...descriptor].filter(Boolean).join(" ");
          })
          .join(", "),
      );
    }
  }

  const metaAll = (...names: string[]) =>
    names.flatMap((name) =>
      [...document.querySelectorAll(`meta[property="${name}"], meta[name="${name}"]`)]
        .map((meta) => clean(meta.getAttribute("content")))
        .filter((value): value is string => Boolean(value)),
    );
  const meta = (...names: string[]) => metaAll(...names)[0] ?? null;

  const citationAuthors = metaAll("citation_author", "dc.creator");
  const published = meta(
    "citation_publication_date",
    "citation_date",
    "article:published_time",
    "dc.date",
    "date",
  );
  const year = Number(published?.match(/\b(19|20)\d{2}\b/)?.[0]) || null;
  const doi =
    meta("citation_doi", "dc.identifier", "prism.doi")
      ?.replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:)/i, "")
      .match(/^10\.\d{4,}\/\S+$/)?.[0] ?? null;
  const image = meta("og:image", "og:image:url", "twitter:image");

  // Readability mutates the document, so read metadata first.
  const article = new Readability(
    document as unknown as ConstructorParameters<typeof Readability>[0],
    {
      keepClasses: false,
    },
  ).parse();

  const text = clean(article?.textContent ?? document.body?.textContent ?? "") ?? "";
  const byline = clean(article?.byline);

  return {
    title: meta("citation_title", "og:title", "twitter:title") ?? clean(article?.title),
    description:
      meta("og:description", "description", "twitter:description") ?? clean(article?.excerpt),
    siteName:
      meta("og:site_name", "citation_journal_title", "application-name") ??
      clean(article?.siteName),
    imageUrl: image ? absolutize(image, url) : firstContentImage(article?.content ?? "", url),
    authors: citationAuthors.length
      ? citationAuthors.map((name) => ({ name }))
      : byline
        ? [{ name: byline.replace(/^by\s+/i, "") }]
        : [],
    doi,
    year,
    html: sanitize(article?.content ?? ""),
    text,
  };
}
