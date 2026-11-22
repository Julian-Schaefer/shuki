import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/** Not worth retrying (blocked host, wrong content type, 404, …). */
export class PermanentFetchError extends Error {
  override name = "PermanentFetchError";
}

const USER_AGENT = "Mozilla/5.0 (compatible; Shuki/0.1; +https://github.com/julian-schaefer/shuki)";
const MAX_REDIRECTS = 5;

/** Address ranges a self-hosted worker must not be tricked into calling. */
const privateRanges = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  privateRanges.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privateRanges.addSubnet(net, prefix, "ipv6");
}

export function isPrivateAddress(address: string): boolean {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return privateRanges.check(mapped, "ipv4");
  const family = isIP(address);
  if (family === 0) return true;
  return privateRanges.check(address, family === 6 ? "ipv6" : "ipv4");
}

async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new PermanentFetchError(`Could not resolve host ${host}`);
      });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new PermanentFetchError(
      `Refusing to fetch ${host}: it points to a private network address`,
    );
  }
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new PermanentFetchError("The page is too large");
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new PermanentFetchError("The page is too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function decodeHtml(body: Uint8Array, contentType: string): string {
  const declared = contentType.match(/charset=([\w-]+)/i)?.[1];
  const sniffed = new TextDecoder("latin1")
    .decode(body.subarray(0, 2048))
    .match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  for (const charset of [declared, sniffed, "utf-8"]) {
    if (!charset) continue;
    try {
      return new TextDecoder(charset).decode(body);
    } catch {
      // Unknown charset label – try the next one.
    }
  }
  return new TextDecoder().decode(body);
}

function allowsEmbedding(headers: Headers): boolean {
  const frameOptions = headers.get("x-frame-options")?.toLowerCase();
  if (frameOptions && /deny|sameorigin/.test(frameOptions)) return false;
  const frameAncestors = headers
    .get("content-security-policy")
    ?.split(";")
    .map((directive) => directive.trim().toLowerCase())
    .find((directive) => directive.startsWith("frame-ancestors"));
  if (frameAncestors) {
    const sources = frameAncestors.split(/\s+/).slice(1);
    return sources.includes("*") || sources.includes("https:");
  }
  return true;
}

/** For user-supplied URLs: http(s) only, private networks blocked on every redirect hop. */
async function safeFetch(
  url: string,
  options: { allowPrivateNetworks: boolean; timeoutMs: number; accept: string },
): Promise<{ response: Response; finalUrl: URL }> {
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new PermanentFetchError(`Unsupported protocol ${current.protocol}`);
    }
    if (!options.allowPrivateNetworks) await assertPublicHost(current);

    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: {
        "user-agent": USER_AGENT,
        accept: options.accept,
        "accept-language": "en,de;q=0.8,*;q=0.5",
      },
    });

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      const message = `The site answered with HTTP ${response.status}`;
      // 4xx won't change on retry (except rate limiting); 5xx might.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new PermanentFetchError(message);
      }
      throw new Error(message);
    }
    return { response, finalUrl: current };
  }
  throw new PermanentFetchError("Too many redirects");
}

export type FetchedPage =
  | { kind: "html"; finalUrl: string; html: string; embeddable: boolean }
  | { kind: "pdf"; finalUrl: string; body: Uint8Array };

export async function fetchPage(
  url: string,
  options: { allowPrivateNetworks: boolean; timeoutMs?: number; maxBytes?: number },
): Promise<FetchedPage> {
  const { allowPrivateNetworks, timeoutMs = 20_000, maxBytes = 25 * 1024 * 1024 } = options;
  const { response, finalUrl } = await safeFetch(url, {
    allowPrivateNetworks,
    timeoutMs,
    accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5",
  });

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/pdf")) {
    return { kind: "pdf", finalUrl: finalUrl.href, body: await readLimited(response, maxBytes) };
  }
  if (!contentType.includes("html")) {
    await response.body?.cancel();
    throw new PermanentFetchError(`Unsupported content type: ${contentType || "unknown"}`);
  }
  const body = await readLimited(response, Math.min(maxBytes, 10 * 1024 * 1024));
  return {
    kind: "html",
    finalUrl: finalUrl.href,
    html: decodeHtml(body, contentType),
    embeddable: allowsEmbedding(response.headers),
  };
}

/** No SVG: it can carry scripts. */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

export async function fetchImage(
  url: string,
  options: { allowPrivateNetworks: boolean; maxBytes?: number },
): Promise<{ body: Uint8Array; contentType: string }> {
  const { response } = await safeFetch(url, {
    allowPrivateNetworks: options.allowPrivateNetworks,
    timeoutMs: 15_000,
    accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
  });
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!contentType || !IMAGE_TYPES.includes(contentType)) {
    await response.body?.cancel();
    throw new PermanentFetchError(`Unsupported image type: ${contentType ?? "unknown"}`);
  }
  return { body: await readLimited(response, options.maxBytes ?? 5 * 1024 * 1024), contentType };
}
