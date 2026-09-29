import { Brain, CheckCircle2, Database, Download, Filter, ListChecks, Loader2, ScanText, ShieldCheck, XCircle, Cpu } from "lucide-react";
import type { Workflow, SourceRun } from "@/lib/types";
import { connectorLabel } from "@/components/utils";
import { StatusBadge } from "@/components/StatusBadge";

type StepState = "done" | "active" | "pending" | "failed";
const ORDER = ["understand", "plan", "collect", "extract", "validate", "store"] as const;
type StepId = (typeof ORDER)[number];

function stepStates(w: Workflow): Record<StepId, StepState> {
  let activeIdx: number;
  switch (w.status) {
    case "queued":
      activeIdx = 0;
      break;
    case "planning":
      activeIdx = w.plan ? 1 : 0;
      if (activeIdx === 0 && w.progress > 5) activeIdx = 1;
      break;
    case "collecting":
      activeIdx = 2;
      break;
    case "processing":
      activeIdx = w.stats?.valid !== undefined || w.progress >= 85 ? 4 : 3;
      break;
    case "completed":
      activeIdx = ORDER.length;
      break;
    case "failed":
      activeIdx = !w.plan ? 1 : w.stats?.raw === undefined ? 2 : w.stats?.valid === undefined ? 3 : 5;
      break;
  }
  const out = {} as Record<StepId, StepState>;
  ORDER.forEach((id, i) => {
    out[id] =
      i < activeIdx ? "done" : i === activeIdx ? (w.status === "failed" ? "failed" : "active") : "pending";
  });
  return out;
}

function Dot({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <div className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      </div>
    );
  if (state === "active")
    return (
      <div className="relative grid h-7 w-7 place-items-center rounded-full bg-violet-500/20 ring-1 ring-violet-500/40">
        <span className="absolute inset-0 animate-ping rounded-full bg-violet-500/20" />
        <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
      </div>
    );
  if (state === "failed")
    return (
      <div className="grid h-7 w-7 place-items-center rounded-full bg-rose-500/15 ring-1 ring-rose-500/30">
        <XCircle className="h-4 w-4 text-rose-400" />
      </div>
    );
  return <div className="h-7 w-7 rounded-full border border-dashed border-zinc-700 bg-zinc-900" />;
}

export function Pipeline({ workflow: w, sources }: { workflow: Workflow; sources: SourceRun[] }) {
  const st = stepStates(w);
  const plan = w.plan;
  const s = w.stats ?? {};

  const steps: { id: StepId; title: string; icon: React.ComponentType<{ className?: string }>; body: React.ReactNode }[] = [
    {
      id: "understand",
      title: "Understand request",
      icon: Brain,
      body: plan ? (
        <div className="space-y-1">
          <p className="text-zinc-300">{plan.intent}</p>
          <p className="text-zinc-500">
            Entity: <span className="text-zinc-300">{plan.entity}</span>
          </p>
        </div>
      ) : (
        <p className="text-zinc-500">Parsing intent and constraints…</p>
      ),
    },
    {
      id: "plan",
      title: "Plan schema & sources",
      icon: ListChecks,
      body: plan ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {plan.fields.map((f) => (
              <span
                key={f.name}
                title={f.description}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[11px] text-zinc-300"
              >
                {f.name}
                <span className="text-violet-400/80">{f.type}</span>
                {f.required && <span className="text-rose-400">*</span>}
              </span>
            ))}
          </div>
          {plan.filters?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Filter className="h-3 w-3 text-zinc-500" />
              {plan.filters.map((f) => (
                <span key={f} className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-200/90 ring-1 ring-amber-500/20">
                  {f}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <Cpu className="h-3 w-3" /> Planner:{" "}
              <span className={plan.planner === "llm" ? "text-violet-300" : "text-zinc-300"}>
                {plan.planner === "llm" ? "LLM" : "Heuristic"}
              </span>
            </span>
            {plan.dedupe_on?.length > 0 && (
              <span>
                Dedupe key: <span className="font-mono text-zinc-300">{plan.dedupe_on.join(" + ")}</span>
              </span>
            )}
            <span>
              Max results: <span className="text-zinc-300">{plan.max_results}</span>
            </span>
          </div>
        </div>
      ) : (
        <p className="text-zinc-500">Designing fields and choosing connectors…</p>
      ),
    },
    {
      id: "collect",
      title: "Collect from sources",
      icon: Download,
      body: plan ? (
        <div className="space-y-1.5">
          {plan.sources.map((src, i) => {
            const run = sources.find((r) => r.connector === src.connector && (r.query ?? "") === (src.query ?? "")) ?? sources[i];
            const matched = run && run.connector === src.connector ? run : undefined;
            return (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/20 px-2.5 py-2">
                <span className="mt-0.5 shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-300 ring-1 ring-sky-500/20">
                  {connectorLabel(src.connector)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11px] text-zinc-300" title={src.query}>
                    {src.query}
                  </div>
                  {src.reason && <div className="text-[11px] text-zinc-500">{src.reason}</div>}
                </div>
                {matched && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[11px] tabular-nums text-zinc-500">{matched.items} items</span>
                    <StatusBadge status={matched.status} />
                  </div>
                )}
              </div>
            );
          })}
          {s.raw !== undefined && <p className="pt-1 text-[11px] text-zinc-500">{s.raw} raw items collected</p>}
        </div>
      ) : (
        <p className="text-zinc-500">Waiting for plan…</p>
      ),
    },
    {
      id: "extract",
      title: "Extract structured fields",
      icon: ScanText,
      body: (
        <p className="text-zinc-500">
          {s.extracted !== undefined ? (
            <>
              <span className="text-zinc-300">{s.extracted}</span> records extracted into schema
            </>
          ) : (
            "Map raw items onto the planned schema."
          )}
        </p>
      ),
    },
    {
      id: "validate",
      title: "Validate & dedupe",
      icon: ShieldCheck,
      body: (
        <p className="text-zinc-500">
          {s.valid !== undefined ? (
            <>
              <span className="text-emerald-300">{s.valid}</span> valid ·{" "}
              <span className="text-amber-300">{s.duplicates ?? 0}</span> duplicates removed ·{" "}
              <span className="text-rose-300">{s.invalid ?? 0}</span> invalid dropped
            </>
          ) : (
            "Apply filters, check required fields, remove duplicates, score confidence."
          )}
        </p>
      ),
    },
    {
      id: "store",
      title: "Store dataset",
      icon: Database,
      body: (
        <p className="text-zinc-500">
          {w.status === "completed" ? (
            <>
              <span className="text-zinc-300">{s.stored ?? w.record_count ?? 0}</span> records stored with source traceability
            </>
          ) : (
            "Persist clean records with source links."
          )}
        </p>
      ),
    },
  ];

  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const state = st[step.id];
        const Icon = step.icon;
        return (
          <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 && (
              <span
                className={`absolute left-[13px] top-8 bottom-0 w-px ${
                  state === "done" ? "bg-emerald-500/30" : "bg-zinc-800"
                }`}
              />
            )}
            <Dot state={state} />
            <div className="min-w-0 flex-1 pt-0.5 text-xs">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${state === "pending" ? "text-zinc-600" : "text-zinc-400"}`} />
                <span className={`text-sm font-medium ${state === "pending" ? "text-zinc-500" : "text-zinc-100"}`}>
                  {step.title}
                </span>
                {state === "active" && <span className="text-[10px] uppercase tracking-wider text-violet-300">running</span>}
              </div>
              <div className={state === "pending" ? "opacity-60" : ""}>{step.body}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
