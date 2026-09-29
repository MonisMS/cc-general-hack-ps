import type { WorkflowStatus } from "@/lib/types";
import { CheckCircle2, CircleDashed, Loader2, XCircle, Brain, Download, Sparkles } from "lucide-react";

const STYLES: Record<string, { cls: string; label: string; Icon: React.ComponentType<{ className?: string }>; spin?: boolean }> = {
  queued: { cls: "bg-zinc-500/10 text-zinc-300 ring-zinc-500/20", label: "Queued", Icon: CircleDashed },
  planning: { cls: "bg-violet-500/10 text-violet-300 ring-violet-500/25", label: "Planning", Icon: Brain },
  collecting: { cls: "bg-sky-500/10 text-sky-300 ring-sky-500/25", label: "Collecting", Icon: Download },
  processing: { cls: "bg-amber-500/10 text-amber-300 ring-amber-500/25", label: "Processing", Icon: Sparkles },
  completed: { cls: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25", label: "Completed", Icon: CheckCircle2 },
  failed: { cls: "bg-rose-500/10 text-rose-300 ring-rose-500/25", label: "Failed", Icon: XCircle },
  ok: { cls: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25", label: "OK", Icon: CheckCircle2 },
  skipped: { cls: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20", label: "Skipped", Icon: CircleDashed },
};

export function StatusBadge({ status }: { status: WorkflowStatus | "ok" | "skipped" | string }) {
  const s = STYLES[status] ?? STYLES.queued;
  const running = status === "planning" || status === "collecting" || status === "processing";
  const Icon = running ? Loader2 : s.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.cls}`}
    >
      <Icon className={`h-3 w-3 ${running ? "animate-spin" : ""}`} />
      {s.label}
    </span>
  );
}
