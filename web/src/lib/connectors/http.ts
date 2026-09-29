import * as cheerio from "cheerio";

export const USER_AGENT = "DataPilotBot/1.0 (+hackathon prototype)";
export const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 DataPilotBot/1.0";
const TIMEOUT_MS = 12_000;

export interface FetchOpts {
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  timeoutMs?: number;
  userAgent?: string;
}

async function doFetch(url: string, opts: FetchOpts = {}, attempt = 0): Promise<Response> {
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    body: opts.body,
    headers: {
      "User-Agent": opts.userAgent ?? USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
      "Api-User-Agent": USER_AGENT, // Wikimedia asks for this
      ...(opts.headers ?? {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
  });
  if ((res.status === 429 || res.status === 503) && attempt < 1) {
    // One polite retry, honoring a short Retry-After.
    const ra = Number(res.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500, 4000)));
    return doFetch(url, opts, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return res;
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await doFetch(url, opts);
  return res.text();
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await doFetch(url, {
    ...opts,
    headers: { Accept: "application/json", ...(opts.headers ?? {}) },
  });
  return (await res.json()) as T;
}

/** Fetch HTML page, returning text + final content-type. Throws on non-HTML. */
export async function fetchPage(url: string, opts: FetchOpts = {}): Promise<{ html: string; finalUrl: string }> {
  const res = await doFetch(url, {
    ...opts,
    headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", ...(opts.headers ?? {}) },
  });
  const ct = res.headers.get("content-type") ?? "";
  if (ct && !/html|xml|text\/plain/i.test(ct)) {
    throw new Error(`Unsupported content-type ${ct} for ${url}`);
  }
  return { html: await res.text(), finalUrl: res.url || url };
}

export function clip(str: string | null | undefined, n: number): string {
  if (!str) return "";
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

export function collapseWs(s: string): string {
  return s.replace(/[ \t\f\v ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Convert an HTML fragment to plain text (block elements become newlines). */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script,style,noscript,template,svg").remove();
  $("br").replaceWith("\n");
  $("p,div,li,h1,h2,h3,h4,h5,h6,tr,section,article,ul,ol").each((_, el) => {
    $(el).append("\n");
  });
  return collapseWs($.root().text());
}

/** Extract readable main text from a full HTML page. */
export function extractMainText(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  const title = collapseWs($("title").first().text()) || collapseWs($("h1").first().text());
  $("script,style,noscript,template,svg,nav,footer,header,aside,form,iframe").remove();
  $('[role="navigation"],[aria-hidden="true"],.cookie,.cookies,#cookie-banner').remove();
  let root = $("main").first();
  if (!root.length || collapseWs(root.text()).length < 200) root = $("article").first();
  if (!root.length || collapseWs(root.text()).length < 200) root = $("body").first();
  const text = htmlToText(root.html() ?? $.root().html() ?? "");
  return { title, text };
}

/** Collect outbound links (absolute, deduped) with anchor text. */
export function extractLinks(html: string, baseUrl: string, max = 30): { text: string; url: string }[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: { text: string; url: string }[] = [];
  $("a[href]").each((_, el) => {
    if (out.length >= max) return false;
    const href = $(el).attr("href") ?? "";
    if (!href || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) return;
    let abs: string;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    if (!/^https?:/i.test(abs)) return;
    const anchor = collapseWs($(el).text() || $(el).attr("title") || $(el).find("img").attr("alt") || "");
    if (!anchor) return;
    const key = abs.replace(/#.*$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ text: clip(anchor, 100), url: key });
  });
  return out;
}

// ---------- robots.txt ----------

const robotsCache = new Map<string, Promise<string[]>>();

function parseRobots(txt: string): string[] {
  const disallow: string[] = [];
  let groupAgents: string[] = [];
  let inRules = false;
  let applies = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (inRules) {
        groupAgents = [];
        inRules = false;
      }
      groupAgents.push(val.toLowerCase());
      applies = groupAgents.includes("*") || groupAgents.some((a) => a && "datapilotbot".includes(a));
    } else if (key === "disallow" || key === "allow") {
      inRules = true;
      if (applies && key === "disallow" && val) disallow.push(val);
    }
  }
  return disallow;
}

function ruleMatches(rule: string, path: string): boolean {
  // Support '*' wildcards and '$' end anchor.
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const re = new RegExp(
    "^" + body.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""),
  );
  return re.test(path);
}

export async function isAllowedByRobots(url: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.origin;
  let p = robotsCache.get(host);
  if (!p) {
    p = fetchText(`${host}/robots.txt`, { timeoutMs: 6000 })
      .then(parseRobots)
      .catch(() => [] as string[]); // allow on failure
    robotsCache.set(host, p);
  }
  const rules = await p;
  const path = u.pathname + u.search;
  return !rules.some((r) => ruleMatches(r, path));
}

export function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/i)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

const STOP = new Set([
  "the", "and", "or", "for", "in", "of", "a", "an", "to", "with", "on", "at", "by", "jobs", "job", "remote", "roles", "role", "positions", "position", "find", "list", "all", "me",
]);

export function stripTags(s: string | null | undefined): string {
  return s ? s.replace(/<[^>]*>/g, "") : "";
}
