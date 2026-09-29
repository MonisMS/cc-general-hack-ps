"use client";

import { useEffect, useRef } from "react";
import type { WorkflowEvent } from "@/lib/types";
import { formatTime } from "@/components/utils";

const LEVEL: Record<WorkflowEvent["level"], { text: string; tag: string }> = {
  info: { text: "text-zinc-300", tag: "text-sky-400" },
  success: { text: "text-emerald-300", tag: "text-emerald-400" },
  warn: { text: "text-amber-200", tag: "text-amber-400" },
  error: { text: "text-rose-300", tag: "text-rose-400" },
};

export function ActivityLog({ events, running }: { events: WorkflowEvent[]; running: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-inner">
      <div className="flex items-center gap-1.5 border-b border-white/5 bg-white/[0.02] px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-2 font-mono text-[11px] text-zinc-500">datapilot · pipeline.log</span>
      </div>
      <div ref={ref} className="max-h-[480px] overflow-y-auto p-3 font-mono text-[12px] leading-6">
        {events.length === 0 && <div className="text-zinc-600">Waiting for events…</div>}
        {events.map((e) => {
          const l = LEVEL[e.level] ?? LEVEL.info;
          return (
            <div key={e.id} className="flex gap-3 rounded px-1 hover:bg-white/[0.03]">
              <span className="shrink-0 text-zinc-600">{formatTime(e.created_at)}</span>
              <span className={`w-20 shrink-0 truncate ${l.tag}`}>[{e.step}]</span>
              <span className={`min-w-0 break-words ${l.text}`}>{e.message}</span>
            </div>
          );
        })}
        {running && (
          <div className="flex gap-3 px-1 text-zinc-500">
            <span className="inline-block h-4 w-2 translate-y-1 animate-pulse bg-violet-400/80" />
          </div>
        )}
      </div>
    </div>
  );
}
