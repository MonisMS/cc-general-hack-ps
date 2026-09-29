"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  Database,
  FileJson,
  FileSpreadsheet,
  Loader2,
  Plug,
  RotateCw,
  ScrollText,
  Table2,
  Trash2,
  XOctagon,
  Workflow as WorkflowIcon,
} from "lucide-react";
import type { DataRecord, SourceRun, Workflow, WorkflowEvent } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { fetchJSON, formatDateTime, isRunning, timeAgo } from "@/components/utils";
import { Pipeline } from "@/components/workflow/Pipeline";
import { DataTable } from "@/components/workflow/DataTable";
import { SourcesTable } from "@/components/workflow/SourcesTable";
import { ActivityLog } from "@/components/workflow/ActivityLog";

interface Detail {
  workflow: Workflow;
  events: WorkflowEvent[];
  sources: SourceRun[];
  record_count: number;
}

type Tab = "data" | "sources" | "log";

export default function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("data");
  const [busy, setBusy] = useState<"rerun" | "delete" | null>(null);
  const lastRecordFetch = useRef(0);

  const loadRecords = useCallback(async () => {
    lastRecordFetch.current = Date.now();
    try {
      const j = await fetchJSON<{ records: DataRecord[] }>(`/api/workflows/${id}/records`);
      setRecords(j.records ?? []);
    } catch {
      /* ignore transient */
    } finally {
      setRecordsLoaded(true);
    }
  }, [id]);

  const load = useCallback(async () => {
    try {
      const j = await fetchJSON<Detail>(`/api/workflows/${id}`);
      setDetail(j);
      setError(null);
      return j;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workflow");
      return null;
    }
  }, [id]);

  const status = detail?.workflow.status;
  const running = status ? isRunning(status) : true;

  // Poll workflow detail while running
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const j = await load();
      if (!alive) return;
      const st = j?.workflow.status;
      if (st && !isRunning(st)) {
        loadRecords();
        return;
      }
      if (st === "processing" && Date.now() - lastRecordFetch.current > 4000) loadRecords();
      timer = setTimeout(tick, 1500);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [load, loadRecords]);

  async function rerun() {
    setBusy("rerun");
    try {
      const j = await fetchJSON<{ id: string }>(`/api/workflows/${id}/rerun`, { method: "POST" });
      router.push(`/workflows/${j.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Rerun failed");
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Delete this workflow and all of its records?")) return;
    setBusy("delete");
    try {
      await fetchJSON(`/api/workflows/${id}`, { method: "DELETE" });
      router.push("/workflows");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
      setBusy(null);
    }
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {error ? (
          <div className="mx-auto mt-16 max-w-md rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-center">
            <XOctagon className="mx-auto h-7 w-7 text-rose-400" />
            <p className="mt-3 text-sm text-zinc-200">Couldn&apos;t load this workflow</p>
            <p className="mt-1 text-xs text-zinc-500">{error}</p>
            <Link href="/workflows" className="mt-4 inline-block text-xs text-violet-300 hover:underline">
              ← Back to workflows
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-8 w-1/2 animate-pulse rounded bg-white/[0.04]" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-white/[0.04]" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
              ))}
            </div>
            <div className="h-80 animate-pulse rounded-xl bg-white/[0.03]" />
          </div>
        )}
      </div>
    );
  }

  const w = detail.workflow;
  const s = w.stats ?? {};
  const recordCount = detail.record_count ?? w.record_count ?? records.length;
  const sourcesOk = s.sources_ok ?? detail.sources.filter((x) => x.status === "ok").length;
  const sourcesFailed = s.sources_failed ?? detail.sources.filter((x) => x.status === "failed").length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link href="/workflows" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
        <ArrowLeft className="h-3.5 w-3.5" /> Workflows
      </Link>

      {/* Header */}
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-white">{w.title || w.plan?.title || w.prompt}</h1>
            <StatusBadge status={w.status} />
          </div>
          <blockquote className="mt-2 flex items-start gap-2 border-l-2 border-violet-500/50 pl-3 text-sm italic text-zinc-400">
            “{w.prompt}”
            <button
              title="Copy prompt"
              onClick={() => navigator.clipboard?.writeText(w.prompt)}
              className="not-italic text-zinc-600 hover:text-zinc-300"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </blockquote>
          <p className="mt-2 text-xs text-zinc-600" title={formatDateTime(w.created_at)}>
            Created {timeAgo(w.created_at)}
            {w.finished_at && <> · finished {timeAgo(w.finished_at)}</>} · ID <span className="font-mono">{w.id}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Btn onClick={rerun} disabled={busy !== null}>
            {busy === "rerun" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />} Rerun
          </Btn>
          <ExportLink href={`/api/workflows/${id}/export?format=csv`} disabled={!recordCount}>
            <FileSpreadsheet className="h-4 w-4" /> Export CSV
          </ExportLink>
          <ExportLink href={`/api/workflows/${id}/export?format=json`} disabled={!recordCount}>
            <FileJson className="h-4 w-4" /> Export JSON
          </ExportLink>
          <Btn onClick={remove} disabled={busy !== null} danger>
            {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Btn>
        </div>
      </div>

      {running && (
        <div className="mt-5 rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-violet-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {detail.events.at(-1)?.message ?? "Starting workflow…"}
            </span>
            <span className="tabular-nums text-zinc-400">{Math.round(w.progress)}%</span>
          </div>
          <ProgressBar value={w.progress} />
        </div>
      )}

      {w.status === "failed" && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-rose-200">Workflow failed</p>
            <p className="mt-0.5 break-words text-xs text-rose-300/80">{w.error || "An unknown error occurred."}</p>
          </div>
          <button onClick={rerun} className="shrink-0 rounded-md bg-rose-500/15 px-2.5 py-1 text-xs text-rose-200 hover:bg-rose-500/25">
            Try again
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Records" value={recordCount} accent="text-white" sub={s.raw !== undefined ? `from ${s.raw} raw items` : undefined} />
        <Stat
          label="Sources"
          value={
            <>
              <span className="text-emerald-300">{sourcesOk}</span>
              <span className="text-zinc-600"> / </span>
              <span className={sourcesFailed ? "text-rose-300" : "text-zinc-500"}>{sourcesFailed}</span>
            </>
          }
          sub="ok / failed"
        />
        <Stat label="Duplicates removed" value={s.duplicates ?? 0} accent="text-amber-300" />
        <Stat label="Invalid dropped" value={s.invalid ?? 0} accent="text-rose-300" />
      </div>

      {/* Main grid */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="h-fit rounded-xl border border-white/5 bg-white/[0.015] p-4 xl:sticky xl:top-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-200">
            <WorkflowIcon className="h-4 w-4 text-violet-300" /> Workflow
          </h2>
          <Pipeline workflow={w} sources={detail.sources} />
        </section>

        <section className="min-w-0">
          <div className="mb-4 flex gap-1 border-b border-white/5">
            <TabBtn active={tab === "data"} onClick={() => setTab("data")} icon={Table2} label="Data" count={recordCount} />
            <TabBtn active={tab === "sources"} onClick={() => setTab("sources")} icon={Plug} label="Sources" count={detail.sources.length} />
            <TabBtn active={tab === "log"} onClick={() => setTab("log")} icon={ScrollText} label="Activity log" count={detail.events.length} />
          </div>
          {tab === "data" && (
            <DataTable
              records={records}
              fields={w.plan?.fields}
              loading={running || !recordsLoaded}
              emptyHint={w.status === "failed" ? "The workflow failed before producing records. Check the activity log for details." : undefined}
            />
          )}
          {tab === "sources" && <SourcesTable sources={detail.sources} running={running} />}
          {tab === "log" && <ActivityLog events={detail.events} running={running} />}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent = "text-zinc-100" }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
        {label === "Records" && <Database className="h-3 w-3" />}
        {label}
      </div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-600">{sub}</div>}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
        active ? "border-violet-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
      <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? "bg-violet-500/20 text-violet-200" : "bg-white/5 text-zinc-500"}`}>
        {count}
      </span>
    </button>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={danger ? "Delete workflow" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition disabled:opacity-40 ${
        danger
          ? "border-white/10 text-zinc-400 hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300"
          : "border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.07]"
      }`}
    >
      {children}
    </button>
  );
}

function ExportLink({ href, children, disabled }: { href: string; children: React.ReactNode; disabled?: boolean }) {
  if (disabled) {
    return (
      <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-600">
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      download
      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100 transition hover:bg-violet-500/20"
    >
      {children}
    </a>
  );
}
