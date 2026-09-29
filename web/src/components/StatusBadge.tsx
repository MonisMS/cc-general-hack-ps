import type { WorkflowStatus } from "@/lib/types";

// Linear-style status glyphs: dashed ring (queued), pie that fills with progress
// (running), filled check (done), filled cross (failed).

const RUNNING_FILL: Record<string, number> = { planning: 0.25, collecting: 0.5, processing: 0.75 };

export function StatusIcon({ status, size = 14, mono = false }: { status: WorkflowStatus | string; size?: number; mono?: boolean }) {
  const s = size;
  const done = mono ? "#c3c6cb" : "#a878f5";
  const run = mono ? "#8a8f98" : "#e2b340";
  if (status === "completed" || status === "ok")
    return (
      <svg width={s} height={s} viewBox="0 0 14 14" aria-hidden>
        <circle cx="7" cy="7" r="6" fill={done} />
        <path d="M4.3 7.2l1.8 1.8 3.6-3.8" stroke="#08090a" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (status === "failed")
    return (
      <svg width={s} height={s} viewBox="0 0 14 14" aria-hidden>
        <circle cx="7" cy="7" r="6" fill="#8a8f98" />
        <path d="M5 5l4 4M9 5l-4 4" stroke="#08090a" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  const f = RUNNING_FILL[status];
  if (f != null) {
    const a = f * 2 * Math.PI;
    const x = 7 + 3.5 * Math.sin(a);
    const y = 7 - 3.5 * Math.cos(a);
    return (
      <svg width={s} height={s} viewBox="0 0 14 14" aria-hidden>
        <circle cx="7" cy="7" r="5.8" fill="none" stroke={run} strokeWidth="1.4" />
        <path d={`M7 7V3.5A3.5 3.5 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`} fill={run} />
      </svg>
    );
  }
  return (
    <svg width={s} height={s} viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="5.8" fill="none" stroke="#6b6f76" strokeWidth="1.4" strokeDasharray="2.2 2" />
    </svg>
  );
}

const LABELS: Record<string, string> = {
  queued: "Queued",
  planning: "Planning",
  collecting: "Collecting",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  ok: "OK",
  skipped: "Skipped",
};

export function StatusBadge({ status, mono }: { status: WorkflowStatus | "ok" | "skipped" | string; mono?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-zinc-300">
      <StatusIcon status={status} size={13} mono={mono} />
      {LABELS[status] ?? status}
    </span>
  );
}
