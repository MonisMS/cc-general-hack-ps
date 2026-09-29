"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ExternalLink, Search, TableProperties } from "lucide-react";
import type { DataRecord, FieldSpec } from "@/lib/types";
import { humanize } from "@/components/utils";
import { Cell, ConfidenceBar, formatValue } from "./Cell";
import { RecordDrawer } from "./RecordDrawer";

const PAGE = 25;
type SortKey = string; // field name | "__source" | "__confidence"

export function DataTable({
  records,
  fields: planFields,
  loading,
  emptyHint,
}: {
  records: DataRecord[];
  fields: FieldSpec[] | undefined;
  loading?: boolean;
  emptyHint?: string;
}) {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const [minConf, setMinConf] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<DataRecord | null>(null);
  const close = useCallback(() => setOpen(null), []);

  const fields: FieldSpec[] = useMemo(() => {
    if (planFields && planFields.length) return planFields;
    const keys = new Set<string>();
    records.forEach((r) => Object.keys(r.data).forEach((k) => keys.add(k)));
    return [...keys].map((k) => ({ name: k, type: "string" as const, description: "" }));
  }, [planFields, records]);

  const sources = useMemo(() => [...new Set(records.map((r) => r.source_name))].sort(), [records]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = records.filter((r) => {
      if (source !== "all" && r.source_name !== source) return false;
      const c = r.confidence <= 1 ? r.confidence * 100 : r.confidence;
      if (c < minConf) return false;
      if (needle) {
        const hay = (Object.values(r.data).map(formatValue).join(" ") + " " + r.source_name).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    if (sort) {
      const get = (r: DataRecord): unknown =>
        sort.key === "__source" ? r.source_name : sort.key === "__confidence" ? r.confidence : r.data[sort.key];
      out = [...out].sort((a, b) => {
        const va = get(a);
        const vb = get(b);
        const ea = va === null || va === undefined || va === "";
        const eb = vb === null || vb === undefined || vb === "";
        if (ea && eb) return 0;
        if (ea) return 1;
        if (eb) return -1;
        const na = typeof va === "number" ? va : Number(va);
        const nb = typeof vb === "number" ? vb : Number(vb);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return (na - nb) * sort.dir;
        return formatValue(va).localeCompare(formatValue(vb), undefined, { numeric: true }) * sort.dir;
      });
    }
    return out;
  }, [records, q, source, minConf, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const rows = filtered.slice(cur * PAGE, cur * PAGE + PAGE);

  function toggleSort(key: SortKey) {
    setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  }

  function sortHead(k: SortKey, label: string) {
    const active = sort?.key === k;
    const Icon = !active ? ArrowUpDown : sort!.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th key={k} className="whitespace-nowrap px-3 py-2.5 font-medium">
        <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 hover:text-zinc-200 ${active ? "text-zinc-200" : ""}`}>
          {label}
          <Icon className={`h-3 w-3 ${active ? "text-violet-300" : "opacity-40"}`} />
        </button>
      </th>
    );
  }

  if (!records.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16 text-center">
        <TableProperties className={`h-7 w-7 text-zinc-600 ${loading ? "animate-pulse" : ""}`} />
        <p className="mt-3 text-sm text-zinc-300">{loading ? "Collecting data…" : "No records"}</p>
        <p className="mt-1 max-w-sm text-xs text-zinc-500">
          {emptyHint ?? (loading ? "Records will appear here as soon as they are validated." : "This workflow produced no valid records.")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder={`Search ${records.length} records…`}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:outline-none"
          >
            <option value="all">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-400">
            Min conf.
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minConf}
              onChange={(e) => {
                setMinConf(Number(e.target.value));
                setPage(0);
              }}
              className="w-20 accent-violet-500"
            />
            <span className="w-8 tabular-nums text-zinc-200">{minConf}%</span>
          </label>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02]">
              <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="w-10 px-3 py-2.5 font-medium">#</th>
                {fields.map((f) => (
                  sortHead(f.name, humanize(f.name))
                ))}
                {sortHead("__source", "Source")}
                {sortHead("__confidence", "Confidence")}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => setOpen(r)}
                  className="cursor-pointer border-b border-white/5 text-zinc-300 transition last:border-0 hover:bg-violet-500/[0.05]"
                >
                  <td className="px-3 py-2.5 text-[11px] tabular-nums text-zinc-600">{cur * PAGE + i + 1}</td>
                  {fields.map((f) => (
                    <td key={f.name} className="max-w-[260px] px-3 py-2.5">
                      <Cell value={r.data[f.name]} type={f.type} />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                      {r.source_name}
                      {r.source_url && (
                        <a
                          href={r.source_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-zinc-500 hover:text-violet-300"
                          title={r.source_url}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <ConfidenceBar value={r.confidence} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={fields.length + 3} className="px-3 py-10 text-center text-sm text-zinc-500">
                    No records match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>
          Showing {filtered.length ? cur * PAGE + 1 : 0}–{Math.min(filtered.length, cur * PAGE + PAGE)} of {filtered.length}
          {filtered.length !== records.length && <> (filtered from {records.length})</>}
        </span>
        <div className="flex items-center gap-1">
          <button
            disabled={cur === 0}
            onClick={() => setPage(cur - 1)}
            className="grid h-7 w-7 place-items-center rounded-md border border-white/10 hover:bg-white/5 disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="px-2 tabular-nums">
            {cur + 1} / {pages}
          </span>
          <button
            disabled={cur >= pages - 1}
            onClick={() => setPage(cur + 1)}
            className="grid h-7 w-7 place-items-center rounded-md border border-white/10 hover:bg-white/5 disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <RecordDrawer record={open} fields={fields} onClose={close} />
    </div>
  );
}
