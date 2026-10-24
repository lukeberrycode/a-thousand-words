// Downloads paintings from Wikimedia Commons for content files (ADR 0026).

// Wikimedia asks API clients to identify themselves.
const USER_AGENT = "a-thousand-words-content/1.0 (https://github.com/lukeberrycode/a-thousand-words)";
// A standard Commons thumbnail width: other widths are rounded up to the next step (3840).
const WIDTH = 1920;

/**
 * Downloads a Commons file at WIDTH pixels wide, via the API's thumbnail URL. Returns null if
 * Commons has no file by that name.
 */
export async function downloadFromCommons(sourcePage: string): Promise<Buffer | null> {
  const file = decodeURIComponent(new URL(sourcePage).pathname.replace(/^\/wiki\//, ""));
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  api.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: String(WIDTH),
    titles: file,
    // Follow file redirects, so a renamed Commons file still resolves.
    redirects: "1",
  }).toString();
  const info = await (await fetch(api, { headers: { "User-Agent": USER_AGENT } })).json();
  const url: string | undefined = info.query?.pages?.[0]?.imageinfo?.[0]?.thumburl;
  if (!url) return null;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Downloading ${file} failed: ${res.status}`);
  // Content paintings are stored as .jpg (contentStorageKey). Commons serves PNG thumbnails of PNGs.
  const type = res.headers.get("content-type");
  if (type !== "image/jpeg") throw new Error(`${file}: Commons sent ${type}; only JPEG files are supported.`);
  return Buffer.from(await res.arrayBuffer());
}
