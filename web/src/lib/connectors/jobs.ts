import type { ConnectorResult, RawItem } from "../types";
import { clip, fetchJson, htmlToText, queryWords } from "./http";

/** Rank items by how many query words appear in their haystack; drop zero-score items if query has words. */
function rankByQuery<T>(items: T[], query: string, hay: (t: T) => string): T[] {
  const words = queryWords(query);
  if (!words.length) return items;
  const scored = items
    .map((it, i) => {
      const h = hay(it).toLowerCase();
      const score = words.reduce((s, w) => s + (h.includes(w) ? 1 : 0), 0);
      return { it, score, i };
    })
    .filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((x) => x.it);
}

// ---------------- Remotive ----------------
interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

export async function remotiveJobs(query: string, limit: number): Promise<ConnectorResult> {
  const q = query.trim();
  const url = `https://remotive.com/api/remote-jobs?${q ? `search=${encodeURIComponent(q)}&` : ""}limit=${Math.max(limit * 2, 20)}`;
  const data = await fetchJson<{ jobs?: RemotiveJob[] }>(url);
  let jobs = data.jobs ?? [];
  // Remotive's search is phrase-ish; if nothing, retry with the first keyword.
  if (!jobs.length && queryWords(q).length > 1) {
    const kw = queryWords(q)[0];
    const d2 = await fetchJson<{ jobs?: RemotiveJob[] }>(
      `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(kw)}&limit=${Math.max(limit * 3, 30)}`,
    );
    jobs = rankByQuery(d2.jobs ?? [], q, (j) => `${j.title} ${j.company_name} ${(j.tags ?? []).join(" ")} ${j.category ?? ""}`);
  }
  // Remotive also matches on description; float title/tag matches to the top without dropping others.
  const top = rankByQuery(jobs, q, (j) => `${j.title} ${(j.tags ?? []).join(" ")} ${j.category ?? ""}`);
  jobs = [...top, ...jobs.filter((j) => !top.includes(j))];
  const items: RawItem[] = jobs.slice(0, limit).map((j) => {
    const desc = htmlToText(j.description);
    const fields = {
      title: j.title,
      company: j.company_name,
      location: j.candidate_required_location ?? null,
      salary: j.salary || null,
      job_type: j.job_type ?? null,
      tags: j.tags ?? [],
      category: j.category ?? null,
      posted_at: j.publication_date ?? null,
      apply_url: j.url,
    };
    return {
      source: "remotive_jobs",
      url: j.url,
      title: `${j.title} — ${j.company_name}`,
      text: clip(desc, 4000),
      fields,
      published_at: j.publication_date,
    };
  });
  return { items, url };
}

// ---------------- Arbeitnow ----------------
interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

export async function arbeitnowJobs(query: string, limit: number): Promise<ConnectorResult> {
  const base = "https://www.arbeitnow.com/api/job-board-api";
  const all: ArbeitnowJob[] = [];
  // Pull a few pages so client-side filtering has something to chew on.
  for (let page = 1; page <= 3; page++) {
    const d = await fetchJson<{ data?: ArbeitnowJob[] }>(`${base}?page=${page}`).catch((e) => {
      if (page === 1) throw e;
      return { data: [] as ArbeitnowJob[] };
    });
    const batch = d.data ?? [];
    all.push(...batch);
    if (!batch.length) break;
    const matched = rankByQuery(all, query, (j) => `${j.title} ${j.company_name} ${j.tags.join(" ")} ${j.location}`);
    if (matched.length >= limit) break;
  }
  const ranked = rankByQuery(all, query, (j) => `${j.title} ${j.company_name} ${j.tags.join(" ")} ${j.location} ${j.remote ? "remote" : ""}`);
  const items: RawItem[] = ranked.slice(0, limit).map((j) => {
    const posted = j.created_at ? new Date(j.created_at * 1000).toISOString() : undefined;
    return {
      source: "arbeitnow_jobs",
      url: j.url,
      title: `${j.title} — ${j.company_name}`,
      text: clip(htmlToText(j.description), 4000),
      fields: {
        title: j.title,
        company: j.company_name,
        location: j.location || null,
        remote: j.remote,
        salary: null,
        job_type: (j.job_types ?? []).join(", ") || null,
        tags: j.tags ?? [],
        posted_at: posted ?? null,
        apply_url: j.url,
      },
      published_at: posted,
    };
  });
  return { items, url: base };
}

// ---------------- RemoteOK ----------------
interface RemoteOkJob {
  id?: string;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  apply_url?: string;
  url?: string;
  legal?: string;
}

export async function remoteokJobs(query: string, limit: number): Promise<ConnectorResult> {
  const url = "https://remoteok.com/api";
  const data = await fetchJson<RemoteOkJob[]>(url);
  const jobs = (Array.isArray(data) ? data : []).filter((j) => !j.legal && j.position);
  const ranked = rankByQuery(jobs, query, (j) => `${j.position} ${j.company} ${(j.tags ?? []).join(" ")} ${j.location ?? ""}`);
  const items: RawItem[] = ranked.slice(0, limit).map((j) => {
    const pageUrl = j.url || `https://remoteok.com/remote-jobs/${j.slug ?? j.id}`;
    const salary =
      j.salary_min || j.salary_max
        ? `$${j.salary_min ?? "?"} - $${j.salary_max ?? "?"}`
        : null;
    return {
      source: "remoteok_jobs",
      url: pageUrl,
      title: `${j.position} — ${j.company}`,
      text: clip(htmlToText(j.description), 4000),
      fields: {
        title: j.position,
        company: j.company,
        location: j.location || null,
        salary,
        job_type: null,
        tags: j.tags ?? [],
        posted_at: j.date ?? null,
        apply_url: j.apply_url || pageUrl,
      },
      published_at: j.date,
    };
  });
  return { items, url };
}
