import { describe, expect, it } from "vitest";
import { extractArticle } from "./extract-article";
import { fetchPage, isPrivateAddress, PermanentFetchError } from "./fetch-page";

const page = `<!doctype html>
<html><head>
  <title>Fallback title</title>
  <meta property="og:title" content="A Study of Things">
  <meta property="og:site_name" content="Example Journal">
  <meta property="og:image" content="/cover.png">
  <meta name="citation_author" content="Ada Lovelace">
  <meta name="citation_author" content="Alan Turing">
  <meta name="citation_doi" content="https://doi.org/10.1234/example.5678">
  <meta name="citation_publication_date" content="2021/05/04">
  <script>alert("x")</script>
</head><body>
  <nav>Menu</nav>
  <article>
    <h1>A Study of Things</h1>
    <p>This is the first paragraph of a long enough article so that Readability considers it the main content of the page. It talks about things.</p>
    <p>Second paragraph with a <a href="/related">relative link</a> and an image <img src="img/figure.png" onerror="alert(1)"> plus more words to make it long enough for extraction to succeed reliably.</p>
    <p>Third paragraph, again with plenty of words, because content scoring prefers longer text blocks with commas, sentences, and so on.</p>
    <script>document.cookie</script>
    <iframe src="https://evil.example"></iframe>
  </article>
</body></html>`;

describe("extractArticle", () => {
  const result = extractArticle(page, "https://journal.example/articles/42");

  it("reads metadata", () => {
    expect(result.title).toBe("A Study of Things");
    expect(result.siteName).toBe("Example Journal");
    expect(result.imageUrl).toBe("https://journal.example/cover.png");
    expect(result.authors).toEqual([{ name: "Ada Lovelace" }, { name: "Alan Turing" }]);
    expect(result.doi).toBe("10.1234/example.5678");
    expect(result.year).toBe(2021);
  });

  it("produces sanitized reader HTML with absolute URLs", () => {
    expect(result.html).toContain("first paragraph");
    expect(result.html).toContain('href="https://journal.example/related"');
    expect(result.html).toContain('src="https://journal.example/articles/img/figure.png"');
    expect(result.html).toContain('rel="noopener noreferrer nofollow"');
    expect(result.html).not.toMatch(/<script|onerror|<iframe/i);
  });

  it("extracts plain text", () => {
    expect(result.text).toContain("Second paragraph");
    expect(result.text).not.toContain("alert");
  });
});

describe("private network protection", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.5",
    "192.168.1.10",
    "169.254.169.254",
    "::1",
    "fd00::1",
    "::ffff:127.0.0.1",
  ])("blocks %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])("allows %s", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it("refuses to fetch localhost", async () => {
    await expect(
      fetchPage("http://localhost:5432/", { allowPrivateNetworks: false }),
    ).rejects.toBeInstanceOf(PermanentFetchError);
  });

  it("refuses non-http protocols", async () => {
    await expect(
      fetchPage("file:///etc/passwd", { allowPrivateNetworks: false }),
    ).rejects.toBeInstanceOf(PermanentFetchError);
  });
});

describe("preview image fallback", () => {
  it("uses the first large article image when there is no og:image", () => {
    const html = `<html><head><title>T</title></head><body><article>
      <p>Long enough paragraph for readability to pick this up as the main article content, with commas, words and more words.</p>
      <img src="/icon.png" width="16">
      <img src="/figures/diagram.png" width="640">
      <p>Another paragraph that is long enough to count as content, with commas, sentences and so on.</p>
    </article></body></html>`;
    expect(extractArticle(html, "https://example.org/a/b").imageUrl).toBe(
      "https://example.org/figures/diagram.png",
    );
  });
});
