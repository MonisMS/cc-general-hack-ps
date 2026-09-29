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
  return status !== "completed" && status !== "failed";
}

export function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
