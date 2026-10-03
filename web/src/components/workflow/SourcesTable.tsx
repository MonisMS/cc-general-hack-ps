import { ExternalLink, Plug } from "lucide-react";
import type { SourceRun } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { connectorLabel, hostOf } from "@/components/utils";

export function SourcesTable({ sources, running }: { sources: SourceRun[]; running: boolean }) {
  if (!sources.length) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-white/10 py-14 text-center">
        <Plug className={`h-6 w-6 text-zinc-600 ${running ? "animate-pulse" : ""}`} />
        <p className="mt-2 text-sm text-zinc-300">{running ? "Connecting to sources…" : "No source runs recorded"}</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-white/5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-white/[0.02]">
            <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-3 py-2.5 font-medium">Connector</th>
              <th className="px-3 py-2.5 font-medium">Query</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Items</th>
              <th className="px-3 py-2.5 text-right font-medium">Duration</th>
              <th className="px-3 py-2.5 font-medium">Request</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-b border-white/5 align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className="rounded bg-zinc-50/[0.04] px-1.5 py-0.5 text-[11px] font-medium text-zinc-300 ring-1 ring-line-strong">
                    {connectorLabel(s.connector)}
                  </span>
                </td>
                <td className="max-w-[280px] px-3 py-2.5">
                  <div className="truncate font-mono text-xs text-zinc-300" title={s.query ?? ""}>
                    {s.query || "—"}
                  </div>
                  {s.error && <div className="mt-1 text-xs text-danger">{s.error}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-200">{s.items}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">
                  {s.duration_ms == null ? "—" : s.duration_ms < 1000 ? `${s.duration_ms} ms` : `${(s.duration_ms / 1000).toFixed(1)} s`}
                </td>
                <td className="max-w-[220px] px-3 py-2.5">
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      title={s.url}
                      className="inline-flex max-w-full items-center gap-1 text-xs text-accent-soft hover:underline"
                    >
                      <span className="truncate">{hostOf(s.url)}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
