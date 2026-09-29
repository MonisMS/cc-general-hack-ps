"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Inbox, Loader2, Plus, RotateCw, Search, Trash2 } from "lucide-react";
import type { Workflow, WorkflowStatus } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { fetchJSON, isRunning, timeAgo, formatDateTime } from "@/components/utils";

const STATUSES: (WorkflowStatus | "all")[] = ["all", "queued", "planning", "collecting", "processing", "completed", "failed"];

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await fetchJSON<{ workflows: Workflow[] }>("/api/workflows");
      setWorkflows(j.workflows ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setWorkflows((w) => w ?? []);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch
    load();
  }, [load]);

  const anyRunning = !!workflows?.some((w) => isRunning(w.status));
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [anyRunning, load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (workflows ?? []).filter(
      (w) =>
        (status === "all" || w.status === status) &&
        (!needle || `${w.title ?? ""} ${w.prompt}`.toLowerCase().includes(needle)),
    );
  }, [workflows, q, status]);

  async function rerun(id: string) {
    setBusy(id);
    try {
      const j = await fetchJSON<{ id: string }>(`/api/workflows/${id}/rerun`, { method: "POST" });
      router.push(`/workflows/${j.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Rerun failed");
      setBusy(null);
    }
  }

  async function remove(w: Workflow) {
    if (!confirm(`Delete workflow "${w.title || w.prompt}"? This removes all its records.`)) return;
    setBusy(w.id);
    try {
      await fetchJSON(`/api/workflows/${w.id}`, { method: "DELETE" });
      setWorkflows((ws) => (ws ?? []).filter((x) => x.id !== w.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Workflows</h1>
          <p className="mt-1 text-sm text-zinc-500">Every data request you&apos;ve run, with its pipeline, sources and results.</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          <Plus className="h-4 w-4" /> New request
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search workflows…"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500/50 focus:outline-none"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-xl border border-white/5 bg-white/[0.015]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium">Workflow</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Records</th>
                <th className="px-4 py-3 text-right font-medium">Sources</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows === null &&
                [0, 1, 2, 3].map((i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="h-5 animate-pulse rounded bg-white/[0.04]" />
                    </td>
                  </tr>
                ))}
              {workflows !== null && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <Inbox className="mx-auto h-6 w-6 text-zinc-600" />
                    <p className="mt-2 text-sm text-zinc-400">
                      {workflows.length === 0 ? "No workflows yet" : "No workflows match your filters"}
                    </p>
                    {workflows.length === 0 && (
                      <Link href="/" className="mt-1 inline-block text-xs text-violet-300 hover:underline">
                        Start a new request →
                      </Link>
                    )}
                  </td>
                </tr>
              )}
              {filtered.map((w) => {
                const ok = w.stats?.sources_ok ?? 0;
                const failed = w.stats?.sources_failed ?? 0;
                const planned = w.plan?.sources?.length ?? 0;
                return (
                  <tr
                    key={w.id}
                    onClick={() => router.push(`/workflows/${w.id}`)}
                    className="cursor-pointer border-b border-white/5 transition last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className="max-w-[380px] px-4 py-3">
                      <div className="truncate font-medium text-zinc-100" title={w.title || w.prompt}>
                        {w.title || w.prompt}
                      </div>
                      {w.title && (
                        <div className="truncate text-xs text-zinc-500" title={w.prompt}>
                          “{w.prompt}”
                        </div>
                      )}
                      {isRunning(w.status) && (
                        <div className="mt-2 max-w-[240px]">
                          <ProgressBar value={w.progress} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={w.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-200">{w.record_count ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                      {ok + failed > 0 ? (
                        <span>
                          <span className="text-emerald-400">{ok}</span>
                          {failed > 0 && <span className="text-rose-400"> / {failed}✕</span>}
                        </span>
                      ) : (
                        planned || "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-400" title={formatDateTime(w.created_at)}>
                      {timeAgo(w.created_at)}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <IconBtn title="Open" onClick={() => router.push(`/workflows/${w.id}`)}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn title="Rerun" onClick={() => rerun(w.id)} disabled={busy === w.id}>
                          {busy === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                        </IconBtn>
                        <IconBtn title="Delete" danger onClick={() => remove(w)} disabled={busy === w.id}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-7 w-7 place-items-center rounded-md border border-white/5 text-zinc-400 transition disabled:opacity-40 ${
        danger ? "hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300" : "hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
