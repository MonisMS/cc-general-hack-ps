import { clip, isAllowedByRobots } from "./http";

// Firecrawl (https://docs.firecrawl.dev) handles what our own fetcher can't: JS-rendered pages,
// bot walls and search + full-page content in one call. Optional: used only when FIRECRAWL_API_KEY
// is set, and callers fall back to the built-in scrapers on any error. FIRECRAWL_API_KEY may hold several
// comma-separated keys; when one is out of credits or rate-limited the next one is tried.

const API = "https://api.firecrawl.dev/v2";
const PAGE_CHARS = 20_000;

const keys = () => (process.env.FIRECRAWL_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
export const firecrawlEnabled = () => keys().length > 0;

// Index of the key to try first; moves past keys that ran out so later calls skip them.
let current = 0;

interface FcDoc {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
  links?: string[];
  metadata?: { title?: string; description?: string; sourceURL?: string; url?: string; statusCode?: number; error?: string };
}

async function call<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const all = keys();
  let lastErr = "";
  for (let i = 0; i < all.length; i++) {
    const k = (current + i) % all.length;
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${all[k]}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string } & T;
    if (res.ok && json.success !== false) {
      current = k;
      return json;
    }
    lastErr = `Firecrawl ${res.status}: ${json.error ?? "request failed"}`.slice(0, 200);
    // bad key, out of credits or rate-limited: try the next key; anything else is about the request itself
    if (![401, 402, 429].includes(res.status)) break;
  }
  throw new Error(lastErr);
}

/** Strip markdown image syntax and collapse whitespace so the extractor sees prose, not noise. */
const tidy = (md: string) =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export interface FcPage {
  url: string;
  title: string;
  snippet: string;
  text: string;
  links: string[];
}

/** Web search with each result's page content. Results disallowed by robots.txt are dropped. */
export async function firecrawlSearch(query: string, limit: number): Promise<FcPage[]> {
  const json = await call<{ data?: { web?: FcDoc[] } | FcDoc[] }>(
    "/search",
    { query, limit: Math.min(Math.max(limit, 1), 10), scrapeOptions: { formats: [{ type: "markdown" }], onlyMainContent: true } },
    60_000,
  );
  const docs = (Array.isArray(json.data) ? json.data : json.data?.web) ?? [];
  const pages = docs
    .map((d) => ({
      url: d.url ?? d.metadata?.sourceURL ?? d.metadata?.url ?? "",
      title: d.title ?? d.metadata?.title ?? "",
      snippet: d.description ?? d.metadata?.description ?? "",
      text: clip(tidy(d.markdown ?? ""), PAGE_CHARS),
      links: d.links ?? [],
    }))
    .filter((p) => /^https?:\/\//.test(p.url));
  const allowed = await Promise.all(pages.map((p) => isAllowedByRobots(p.url).catch(() => true)));
  return pages.filter((_, i) => allowed[i]);
}

/** Render and read one page (JS included). Caller is responsible for the robots.txt / safety checks. */
export async function firecrawlScrape(url: string): Promise<FcPage> {
  const json = await call<{ data?: FcDoc }>("/scrape", { url, formats: ["markdown", "links"], onlyMainContent: true }, 45_000);
  const d = json.data ?? {};
  if (d.metadata?.statusCode && d.metadata.statusCode >= 400) throw new Error(`Firecrawl: ${url} returned ${d.metadata.statusCode}`);
  return {
    url: d.metadata?.url ?? d.metadata?.sourceURL ?? url,
    title: d.metadata?.title ?? "",
    snippet: d.metadata?.description ?? "",
    text: clip(tidy(d.markdown ?? ""), PAGE_CHARS),
    links: (d.links ?? []).filter((l) => /^https?:\/\//.test(l)),
  };
}
