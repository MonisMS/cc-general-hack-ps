"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Copy,
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
import { StatusBadge, StatusIcon } from "@/components/StatusBadge";
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
    <div>
      <header className="flex h-11 items-center gap-2 border-b border-line px-5 text-[13px]">
        <Link href="/workflows" className="text-zinc-500 hover:text-zinc-200">Workflows</Link>
        <span className="text-zinc-700">›</span>
        <span className="min-w-0 truncate text-zinc-200">{w.title || w.plan?.title || w.prompt}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Btn onClick={rerun} disabled={busy !== null}>
            {busy === "rerun" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />} Rerun
          </Btn>
          <ExportLink href={`/api/workflows/${id}/export?format=csv`} disabled={!recordCount}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
          </ExportLink>
          <ExportLink href={`/api/workflows/${id}/export?format=json`} disabled={!recordCount}>
            <FileJson className="h-3.5 w-3.5" /> JSON
          </ExportLink>
          <Btn onClick={remove} disabled={busy !== null} danger>
            {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Btn>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-5 py-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold text-zinc-100">{w.title || w.plan?.title || w.prompt}</h1>
          <StatusBadge status={w.status} />
        </div>
        <div className="mt-2 flex items-start gap-2 text-[13px] text-zinc-400">
          <span className="text-zinc-600">Prompt</span>
          <span className="min-w-0">{w.prompt}</span>
          <button title="Copy prompt" onClick={() => navigator.clipboard?.writeText(w.prompt)} className="text-zinc-600 hover:text-zinc-300">
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1 text-[12px] text-zinc-600" title={formatDateTime(w.created_at)}>
          Created {timeAgo(w.created_at)}
          {w.finished_at && <> · finished {timeAgo(w.finished_at)}</>} · <span className="font-mono">{w.id}</span>
        </p>
      </div>

      {running && (
        <div className="mt-5 rounded-lg border border-line bg-canvas px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-[12.5px]">
            <span className="inline-flex items-center gap-2 text-zinc-300">
              <StatusIcon status={w.status} size={13} />
              {detail.events.at(-1)?.message ?? "Starting workflow…"}
            </span>
            <span className="font-mono text-[11.5px] tabular-nums text-zinc-500">{Math.round(w.progress)}%</span>
          </div>
          <ProgressBar value={w.progress} />
        </div>
      )}

      {w.status === "failed" && (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-line bg-canvas px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-zinc-200">Workflow failed</p>
            <p className="mt-0.5 break-words text-[12.5px] text-zinc-500">{w.error || "An unknown error occurred."}</p>
          </div>
          <button onClick={rerun} className="h-7 shrink-0 rounded-md bg-zinc-100 px-2.5 text-[12.5px] font-medium text-zinc-950 hover:bg-white">
            Try again
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-lg border border-line md:grid-cols-4">
        <Stat label="Records" value={recordCount} sub={s.raw !== undefined ? `from ${s.raw} raw items` : undefined} />
        <Stat label="Sources" value={<>{sourcesOk}<span className="text-zinc-600"> / {sourcesOk + sourcesFailed}</span></>} sub={sourcesFailed ? `${sourcesFailed} failed` : "all responded"} />
        <Stat label="Duplicates merged" value={s.duplicates ?? 0} />
        <Stat label="Invalid dropped" value={s.invalid ?? 0} />
      </div>

      {/* Main grid */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="h-fit rounded-lg border border-white/[0.06] bg-white/[0.012] p-4 xl:sticky xl:top-6">
          <h2 className="mb-4 flex items-center gap-2 text-[13px] font-medium text-zinc-200">
            <WorkflowIcon className="h-3.5 w-3.5 text-zinc-500" /> Workflow
          </h2>
          <Pipeline workflow={w} sources={detail.sources} />
        </section>

        <section className="min-w-0">
          <div className="mb-4 flex gap-1 border-b border-line">
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
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="border-line px-4 py-3 [&:not(:last-child)]:border-r max-md:[&:nth-child(2)]:border-r-0 max-md:[&:nth-child(-n+2)]:border-b">
      <div className="text-[12px] text-zinc-500">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums text-zinc-100">{value}</div>
      {sub && <div className="text-[11.5px] text-zinc-600">{sub}</div>}
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
      className={`-mb-px inline-flex items-center gap-1.5 border-b px-3 py-2 text-[13px] transition ${
        active ? "border-zinc-200 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? "bg-white/[0.08] text-zinc-300" : "bg-white/[0.04] text-zinc-500"}`}>
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
      className={`inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2.5 text-[12.5px] transition disabled:opacity-40 ${
        danger ? "text-zinc-500 hover:text-zinc-200" : "text-zinc-200 hover:bg-white/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}

function ExportLink({ href, children, disabled }: { href: string; children: React.ReactNode; disabled?: boolean }) {
  if (disabled) {
    return (
      <span className="inline-flex h-7 cursor-not-allowed items-center gap-1.5 rounded-md border border-line px-2.5 text-[12.5px] text-zinc-600">
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      download
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2.5 text-[12.5px] text-zinc-200 transition hover:bg-white/[0.06]"
    >
      {children}
    </a>
  );
}
