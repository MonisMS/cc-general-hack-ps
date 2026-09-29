"use client";

import { useEffect } from "react";
import { Clock, ExternalLink, Link2, X } from "lucide-react";
import type { DataRecord, FieldSpec } from "@/lib/types";
import { formatDateTime, hostOf, humanize } from "@/components/utils";
import { Cell, ConfidenceBar } from "./Cell";

export function RecordDrawer({
  record,
  fields,
  onClose,
}: {
  record: DataRecord | null;
  fields: FieldSpec[];
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (!record) return null;
  const known = new Set(fields.map((f) => f.name));
  const extra = Object.keys(record.data).filter((k) => !known.has(k));
  const rows: { key: string; type?: FieldSpec["type"]; desc?: string }[] = [
    ...fields.map((f) => ({ key: f.name, type: f.type, desc: f.description })),
    ...extra.map((k) => ({ key: k })),
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="animate-slide-in relative flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Record #{record.id}</div>
            <div className="mt-0.5 truncate text-base font-medium text-white">
              {String(record.data[fields[0]?.name] ?? record.data.name ?? record.data.title ?? "Record details")}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-violet-200">
              <Link2 className="h-3.5 w-3.5" /> Traceability
            </div>
            <p className="mt-1.5 text-sm text-zinc-300">
              Fetched from <span className="font-medium text-white">{record.source_name}</span>
              {record.source_url && (
                <>
                  {" "}
                  (<span className="text-zinc-400">{hostOf(record.source_url)}</span>)
                </>
              )}
            </p>
            <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
              <Clock className="h-3 w-3" /> {formatDateTime(record.fetched_at)}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              {record.source_url ? (
                <a
                  href={record.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
                >
                  Open source <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-xs text-zinc-500">No source URL</span>
              )}
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                Confidence <ConfidenceBar value={record.confidence} />
              </div>
            </div>
          </div>

          <dl className="mt-5 divide-y divide-white/5">
            {rows.map(({ key, type, desc }) => (
              <div key={key} className="grid grid-cols-[140px_1fr] gap-3 py-2.5 text-sm">
                <dt className="text-xs text-zinc-500" title={desc}>
                  {humanize(key)}
                  {type && <div className="font-mono text-[10px] text-zinc-700">{type}</div>}
                </dt>
                <dd className="min-w-0 text-zinc-200">
                  <Cell value={record.data[key]} type={type} full />
                </dd>
              </div>
            ))}
          </dl>

          <details className="mt-5 rounded-lg border border-white/5 bg-black/30">
            <summary className="cursor-pointer px-3 py-2 text-xs text-zinc-400">Raw JSON</summary>
            <pre className="overflow-x-auto px-3 pb-3 font-mono text-[11px] leading-relaxed text-zinc-400">
              {JSON.stringify(record, null, 2)}
            </pre>
          </details>
        </div>
      </aside>
    </div>
  );
}
