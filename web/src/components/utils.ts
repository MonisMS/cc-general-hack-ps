import type { WorkflowStatus } from "@/lib/types";

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function isRunning(status: WorkflowStatus): boolean {
  return status !== "completed" && status !== "failed" && status !== "review" && status !== "cancelled";
}

const WORDS: Record<string, string> = { url: "link", usd: "(USD)", pct: "%", id: "ID", api: "API", ai: "AI", hn: "HN", github: "GitHub" };

/** snake_case field name → plain-English label: "posted_at" → "Posted", "apply_url" → "Apply link", "price_usd" → "Price (USD)". */
export function humanize(key: string): string {
  const words = key.split(/[_\s]+/).filter(Boolean);
  if (words.length > 1 && words.at(-1) === "at") words.pop(); // posted_at → posted
  const out = words.map((w) => WORDS[w.toLowerCase()] ?? w.toLowerCase()).join(" ").replace(/ %/g, " %");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Guess a column's type from its plain-English name, so users never have to pick "string" vs "url". */
export function inferFieldType(label: string): "string" | "number" | "url" | "date" | "email" | "list" {
  const l = label.toLowerCase();
  if (/\b(e-?mail)\b/.test(l)) return "email";
  if (/\b(url|link|website|site|homepage|profile)\b/.test(l)) return "url";
  if (/\b(date|posted|founded|published|deadline|when|year)\b/.test(l)) return "date";
  if (/\b(tags|skills|topics|categories|technologies|stack|list)\b/.test(l)) return "list";
  if (/\b(count|number|stars|rank|score|price|revenue|funding amount|employees|followers|rating|points|cap|volume)\b/.test(l)) return "number";
  return "string";
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const CONNECTOR_LABELS: Record<string, string> = {
  remotive_jobs: "Remotive Jobs",
  arbeitnow_jobs: "Arbeitnow Jobs",
  remoteok_jobs: "RemoteOK Jobs",
  hackernews: "Hacker News",
  github_repos: "GitHub",
  wikipedia: "Wikipedia",
  web_search: "Web Search",
  url_fetch: "URL Fetch",
  coingecko: "CoinGecko",
};

export function connectorLabel(id: string): string {
  return CONNECTOR_LABELS[id] ?? humanize(id);
}

export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
