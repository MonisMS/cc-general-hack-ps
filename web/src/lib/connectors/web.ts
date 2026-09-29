import * as cheerio from "cheerio";
import type { ConnectorResult, RawItem } from "../types";
import {
  BROWSER_UA,
  clip,
  collapseWs,
  extractLinks,
  extractMainText,
  fetchPage,
  fetchText,
  isAllowedByRobots,
  queryWords,
} from "./http";
import { wikipedia } from "./apis";

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

function unwrapDdg(href: string): string {
  try {
    const u = new URL(href, "https://duckduckgo.com");
    const real = u.searchParams.get("uddg");
    if (real) return real;
    return u.toString();
  } catch {
    return href;
  }
}

async function searchDdg(query: string): Promise<SearchHit[]> {
  const html = await fetchText("https://html.duckduckgo.com/html/", {
    method: "POST",
    body: new URLSearchParams({ q: query, kl: "us-en" }).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: "https://html.duckduckgo.com/" },
    userAgent: BROWSER_UA,
  });
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  $(".result").each((_, el) => {
    const a = $(el).find("a.result__a").first();
    const href = a.attr("href");
    if (!href) return;
    const url = unwrapDdg(href);
    if (!/^https?:/.test(url) || /duckduckgo\.com\/y\.js/.test(url)) return; // skip ads
    hits.push({
      title: collapseWs(a.text()),
      url,
      snippet: collapseWs($(el).find(".result__snippet").text()),
    });
  });
  return hits;
}

function unwrapBing(href: string): string {
  // Bing sometimes wraps as /ck/a?...&u=a1<base64url>
  try {
    const u = new URL(href, "https://www.bing.com");
    if (u.hostname.endsWith("bing.com") && u.pathname.startsWith("/ck/")) {
      const enc = u.searchParams.get("u");
      if (enc && enc.startsWith("a1")) {
        const b64 = enc.slice(2).replace(/-/g, "+").replace(/_/g, "/");
        return Buffer.from(b64, "base64").toString("utf8");
      }
    }
    return u.toString();
  } catch {
    return href;
  }
}

async function searchBing(query: string): Promise<SearchHit[]> {
  const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en&cc=US`, {
    userAgent: BROWSER_UA,
    headers: { Accept: "text/html" },
  });
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  $("li.b_algo").each((_, el) => {
    const a = $(el).find("h2 a").first();
    const href = a.attr("href");
    if (!href) return;
    const url = unwrapBing(href);
    if (!/^https?:/.test(url)) return;
    hits.push({
      title: collapseWs(a.text()),
      url,
      snippet: collapseWs($(el).find(".b_caption p, .b_lineclamp2, .b_lineclamp3, .b_lineclamp4").first().text()),
    });
  });
  return hits;
}

async function searchBingRss(query: string): Promise<SearchHit[]> {
  const xml = await fetchText(`https://www.bing.com/search?format=rss&setlang=en&cc=US&q=${encodeURIComponent(query)}`, {
    userAgent: BROWSER_UA,
  });
  const $ = cheerio.load(xml, { xml: true });
  const hits: SearchHit[] = [];
  $("item").each((_, el) => {
    const url = $(el).find("link").first().text().trim();
    if (!/^https?:/.test(url) || /bing\.com/.test(url)) return;
    hits.push({
      title: collapseWs($(el).find("title").first().text()),
      url,
      snippet: collapseWs($(el).find("description").first().text()),
    });
  });
  return hits;
}

/** Bing serves off-topic results to bot-like clients; keep only hits sharing enough query words. */
function relevant(hits: SearchHit[], query: string): SearchHit[] {
  const words = queryWords(query).map((w) => w.replace(/\.js$/, ""));
  if (!words.length) return hits;
  const need = Math.max(1, Math.ceil(words.length / 2));
  return hits.filter((h) => {
    const hay = `${h.title} ${h.snippet} ${h.url}`.toLowerCase();
    return words.filter((w) => hay.includes(w)).length >= need;
  });
}

/** Fetch a page respecting robots.txt; returns null on any failure. */
async function fetchReadable(url: string, maxChars = 4000): Promise<{ title: string; text: string; html: string; finalUrl: string } | null> {
  try {
    if (!(await isAllowedByRobots(url))) return null;
    const { html, finalUrl } = await fetchPage(url, { userAgent: BROWSER_UA, timeoutMs: 10_000 });
    const { title, text } = extractMainText(html);
    return { title, text: clip(text, maxChars), html, finalUrl };
  } catch {
    return null;
  }
}

export async function webSearch(query: string, limit: number): Promise<ConnectorResult> {
  const engines: [string, string, (q: string) => Promise<SearchHit[]>, boolean][] = [
    ["duckduckgo", `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, searchDdg, false],
    ["bing-rss", `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`, searchBingRss, true],
    ["bing", `https://www.bing.com/search?q=${encodeURIComponent(query)}`, searchBing, true],
  ];
  let hits: SearchHit[] = [];
  let usedUrl = engines[0][1];
  const errors: string[] = [];
  for (const [name, url, fn, filter] of engines) {
    try {
      let h = await fn(query);
      if (filter) h = relevant(h, query);
      if (h.length) {
        hits = h;
        usedUrl = url;
        break;
      }
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!hits.length) {
    // Last resort: Wikipedia full-text search so the pipeline still gets something traceable.
    try {
      const w = await wikipedia(query, limit);
      if (w.items.length) {
        return { items: w.items.map((i) => ({ ...i, source: "web_search" as const })), url: w.url };
      }
    } catch (e) {
      errors.push(`wikipedia: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (errors.length === engines.length) throw new Error(`web_search: all engines failed (${errors.join("; ")})`);
    return { items: [], url: usedUrl };
  }
  // dedupe by URL
  const seen = new Set<string>();
  hits = hits.filter((h) => (seen.has(h.url) ? false : (seen.add(h.url), true))).slice(0, limit);

  const deep = Math.min(limit, 6);
  const pages = await Promise.all(hits.slice(0, deep).map((h) => fetchReadable(h.url)));
  const items: RawItem[] = hits.map((h, i) => {
    const page = pages[i];
    const text = page ? `${h.snippet}\n\n${page.text}` : h.snippet;
    return {
      source: "web_search",
      url: h.url,
      title: h.title || page?.title || h.url,
      text: clip(text, 4500),
      fields: { title: h.title, url: h.url, snippet: h.snippet, page_fetched: !!page },
    };
  });
  return { items, url: usedUrl };
}

export async function urlFetch(query: string, limit: number): Promise<ConnectorResult> {
  const urls = [
    ...new Set(
      query
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (/^https?:\/\//i.test(s) ? s : /^[\w-]+(\.[\w-]+)+/.test(s) ? `https://${s}` : ""))
        .filter(Boolean),
    ),
  ].slice(0, Math.max(limit, 1));
  if (!urls.length) return { items: [] };

  const errors: string[] = [];
  const items: RawItem[] = [];
  await Promise.all(
    urls.map(async (url) => {
      try {
        if (!(await isAllowedByRobots(url))) {
          errors.push(`${url}: disallowed by robots.txt`);
          return;
        }
        const { html, finalUrl } = await fetchPage(url, { userAgent: BROWSER_UA });
        const { title, text } = extractMainText(html);
        const links = extractLinks(html, finalUrl, 30);
        const linkBlock = links.length ? `\n\nLINKS:\n${links.map((l) => `- ${l.text} — ${l.url}`).join("\n")}` : "";
        items.push({
          source: "url_fetch",
          url: finalUrl,
          title: title || finalUrl,
          text: clip(text, 4000) + linkBlock,
          fields: { url: finalUrl, links },
        });
      } catch (e) {
        errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  );
  if (!items.length && errors.length) throw new Error(`url_fetch failed: ${errors.join("; ")}`);
  return { items, url: urls[0] };
}
