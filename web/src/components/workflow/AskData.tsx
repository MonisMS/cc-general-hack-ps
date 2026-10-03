"use client";

import { useState } from "react";
import { ArrowUp, Loader2, MessageSquareText, Sparkles } from "lucide-react";
import type { FieldSpec } from "@/lib/types";
import { fetchJSON, humanize } from "@/components/utils";

interface Answer {
  question: string;
  answer?: string;
  record_ids?: number[];
  error?: string;
}

function suggestions(fields: FieldSpec[], entity: string | undefined): string[] {
  const plural = !entity ? "rows" : /[^aeiou]y$/.test(entity) ? entity.slice(0, -1) + "ies" : /(s|x|ch|sh)$/.test(entity) ? entity + "es" : entity + "s";
  const out = [`Summarize these ${plural} in 3 bullets`];
  const num = fields.find((f) => !/rank|_id$/i.test(f.name) && (f.type === "number" || /salary|price|stars|revenue|cap/i.test(f.name)));
  if (num) out.push(`Which 5 have the highest ${humanize(num.name).toLowerCase()}?`);
  const group = fields.find((f) => /company|location|category|language|owner|country/i.test(f.name));
  if (group) out.push(`Which ${humanize(group.name).toLowerCase()} appears most often?`);
  out.push("Which rows look least reliable, and why?");
  return out.slice(0, 4);
}

export function AskData({
  workflowId,
  fields,
  entity,
  disabled,
  onCite,
}: {
  workflowId: string;
  fields: FieldSpec[];
  entity?: string;
  disabled?: boolean;
  onCite: (ids: number[] | null) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Answer[]>([]);

  async function ask(text = q) {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setQ("");
    try {
      const j = await fetchJSON<{ answer: string; record_ids: number[] }>(`/api/workflows/${workflowId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      setHistory((h) => [{ question, ...j }, ...h].slice(0, 5));
      onCite(j.record_ids?.length ? j.record_ids : null);
    } catch (e) {
      setHistory((h) => [{ question, error: e instanceof Error ? e.message : "Failed" }, ...h].slice(0, 5));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="ask-title" className="glass mb-4 rounded-lg p-4">
      <div className="flex items-baseline gap-2">
        <h3 id="ask-title" className="flex items-center gap-1.5 text-[13.5px] font-medium text-zinc-100">
          <Sparkles className="h-3.5 w-3.5 text-zinc-400" aria-hidden /> Ask this dataset
        </h3>
        <span className="text-[12px] text-zinc-500">Answers point to the rows they used.</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="mt-3 flex gap-2"
      >
        <label htmlFor="ask-input" className="sr-only">
          Your question about this dataset
        </label>
        <div className="relative min-w-0 flex-1">
          <MessageSquareText className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input
            id="ask-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={disabled || busy}
            placeholder={disabled ? "Questions open once the dataset is ready" : `Type a question, e.g. ${suggestions(fields, entity)[1] ?? suggestions(fields, entity)[0]}`}
            className="h-11 w-full rounded-lg border border-line-strong bg-zinc-950/70 pl-10 pr-3 text-[14px] text-zinc-50 caret-zinc-50 shadow-[inset_0_1px_2px_color-mix(in_oklab,var(--color-zinc-950)_60%,transparent)] transition placeholder:text-zinc-500 hover:border-zinc-600 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-50/10 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || busy || !q.trim()}
          className="btn-glow inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-4 text-[13.5px] font-medium"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />}
          {busy ? "Thinking" : "Ask"}
        </button>
      </form>

      {!history.length && !disabled && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-zinc-500">Try:</span>
          {suggestions(fields, entity).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              disabled={busy}
              className="rounded-full border border-line-strong bg-zinc-50/[0.03] px-3 py-1 text-[12px] text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {history.map((a, i) => (
        <div key={history.length - i} className={`mt-3 border-t border-white/5 pt-3 ${i > 0 ? "opacity-60" : "animate-fade-up"}`}>
          <div className="flex items-center gap-1.5 text-[12px] text-zinc-500">
            <MessageSquareText className="h-3.5 w-3.5" /> {a.question}
          </div>
          {a.error ? (
            <p className="mt-1.5 text-sm text-zinc-400">⚠ {a.error}</p>
          ) : (
            <>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{a.answer}</p>
              {!!a.record_ids?.length && (
                <button onClick={() => onCite(a.record_ids!)} className="mt-2 text-[12px] text-accent-soft hover:underline">
                  Show the {a.record_ids.length} cited row{a.record_ids.length === 1 ? "" : "s"} →
                </button>
              )}
            </>
          )}
        </div>
      ))}
    </section>
  );
}
