"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Sparkles, Briefcase, Building2, Coins, CornerDownLeft, GitBranch, Handshake, Loader2, MessagesSquare } from "lucide-react";
import { StatusIcon } from "@/components/StatusBadge";
import { fetchJSON } from "@/components/utils";

const EXAMPLES = [
  { icon: Briefcase, tag: "Jobs", prompt: "Remote React developer jobs posted this week with salary info" },
  { icon: GitBranch, tag: "Leads", prompt: "AI startups on GitHub building developer tools" },
  { icon: Handshake, tag: "Sponsors", prompt: "Sponsor opportunities for a college hackathon in India" },
  { icon: Coins, tag: "Market", prompt: "Top 20 cryptocurrencies by market cap" },
  { icon: MessagesSquare, tag: "Research", prompt: "Hacker News discussions about AI coding agents this month" },
  { icon: Building2, tag: "Companies", prompt: "Largest Indian IT services companies" },
];

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  async function submit(text = prompt) {
    const p = text.trim();
    if (!p || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const j = await fetchJSON<{ id: string }>("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      router.push(`/workflows/${j.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="ai-home relative overflow-hidden md:rounded-2xl">
      <div className="ai-aura" />
      <header className="relative flex h-12 items-center justify-between px-6 text-[13px] text-zinc-400">
        <span>New request</span>
        <span className="pill border border-white/15 text-zinc-200">
          <Sparkles className="h-3.5 w-3.5 text-violet-400" /> 9 live sources
        </span>
      </header>

      <div className="relative mx-auto max-w-[720px] px-4 pb-20 pt-16 text-center sm:px-6 md:pt-24">
        <h1 className="text-[36px] font-medium leading-[1.08] tracking-[-0.03em] text-zinc-50 sm:text-[52px]">
          Ask for data.
          <br />
          <span className="text-ai">Get a dataset.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-[540px] text-[15.5px] leading-relaxed text-zinc-400">
          Describe what you need in plain English. DataPilot plans the sources, collects from the live web, and
          returns a clean table where every row links back to where it came from.
        </p>

        {/* Composer */}
        <div className="ai-box mt-14 text-left">
          <div className="ai-box-inner">
            <textarea
              ref={taRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter inserts a newline; ignore Enter while an IME is composing
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={4}
              autoFocus
              placeholder="Ask for any dataset — e.g. SaaS companies in Bangalore hiring backend engineers"
              className="block w-full resize-none bg-transparent px-5 pt-4 text-[15px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />
            <div className="flex items-center gap-2 px-4 pb-4 pt-2">
              <span title="Sources are picked automatically" className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.07] text-zinc-300">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="hidden h-9 items-center rounded-full bg-white/[0.07] px-3.5 text-[12.5px] text-zinc-300 sm:inline-flex">
                Auto sources · dedupe · validate
              </span>
              <span className="ml-auto hidden items-center gap-1 text-[11.5px] text-zinc-500 sm:inline-flex">
                <kbd className="rounded border border-white/10 px-1 font-mono text-[10.5px]">
                  <CornerDownLeft className="inline h-2.5 w-2.5" />
                </kbd>
                to run
              </span>
              <button
                onClick={() => submit()}
                disabled={!prompt.trim() || submitting}
                aria-label="Run workflow"
                className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-medium text-zinc-950 shadow-[0_0_24px_-4px_rgba(255,255,255,0.45)] transition hover:shadow-[0_0_30px_-2px_rgba(255,255,255,0.6)] disabled:bg-white/10 disabled:text-zinc-500 disabled:shadow-none sm:ml-1"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                {submitting ? "Starting" : "Run"}
              </button>
            </div>
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] text-zinc-300">⚠ {error}</p>}

        {/* Suggestions */}
        <div className="mt-14 text-left">
          <div className="mb-2 text-[12px] font-medium text-zinc-500">Try one of these</div>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30 backdrop-blur">
            {EXAMPLES.map(({ icon: Icon, tag, prompt: p }) => (
              <button
                key={tag}
                onClick={() => {
                  setPrompt(p);
                  taRef.current?.focus();
                }}
                className="group flex w-full items-center gap-3 border-b border-line px-3.5 py-2.5 text-left last:border-0 hover:bg-white/[0.03]"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500 group-hover:text-zinc-300" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-300 group-hover:text-zinc-100">{p}</span>
                <span className="text-[11.5px] text-zinc-600">{tag}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Demo */}
        <div className="mt-14 text-left">
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-[12px] font-medium text-zinc-500">How it works</div>
            <div className="text-[11.5px] text-zinc-600">Sample run · replays automatically</div>
          </div>
          <DemoRun />
        </div>
      </div>
    </div>
  );
}

// ---------- Animated sample run (static data, loops) ----------

const DEMO_PROMPT = "Remote React jobs with salary info";
const DEMO_STEPS = [
  { label: "Understand request", detail: "entity: job posting · filter: has salary" },
  { label: "Plan workflow", detail: "8 fields · 3 sources" },
  { label: "Collect", detail: "Remotive 16 · Arbeitnow 14 · RemoteOK 7" },
  { label: "Extract & validate", detail: "37 items → 35 valid" },
  { label: "Dedupe & store", detail: "2 duplicates merged" },
];
const DEMO_ROWS = [
  ["Frontend Web Application Developer", "KoboToolbox", "$90k – $105k", "remotive.com"],
  ["Senior Shopify Developer", "Sanctuary Computer", "$80k – $150k", "remotive.com"],
  ["Senior Frontend Engineer", "Hotjar", "€70k – €85k", "remoteok.com"],
  ["React Native Developer", "Toggl", "$75k – $95k", "arbeitnow.com"],
  ["Full-stack Engineer (React/Node)", "Close", "$120k – $160k", "remoteok.com"],
];

function DemoRun() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => (x + 1) % 16), 700);
    return () => clearInterval(t);
  }, []);
  const typed = DEMO_PROMPT.slice(0, Math.min(DEMO_PROMPT.length, tick * 9));
  const step = tick - 3; // steps start after the prompt is typed
  const rows = Math.max(0, Math.min(DEMO_ROWS.length, tick - 7));

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40 backdrop-blur">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[13px]">
        <span className="text-zinc-600">›</span>
        <span className="text-zinc-200">{typed}</span>
        {tick < 3 && <span className="animate-caret -ml-1 h-4 w-px bg-zinc-300" />}
      </div>
      <div className="grid md:grid-cols-[220px_1fr]">
        <ol className="border-b border-line p-3 md:border-b-0 md:border-r">
          {DEMO_STEPS.map((s, i) => {
            const state = step > i ? "completed" : step === i ? "processing" : "queued";
            return (
              <li key={s.label} className="flex gap-2.5 rounded-md px-1.5 py-1.5">
                <span className="mt-0.5">
                  <StatusIcon status={state} size={13} />
                </span>
                <div className="min-w-0">
                  <div className={`text-[12.5px] ${state === "queued" ? "text-zinc-600" : "text-zinc-200"}`}>{s.label}</div>
                  {state !== "queued" && <div className="animate-fade-up truncate text-[11.5px] text-zinc-500">{s.detail}</div>}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[460px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[11.5px] text-zinc-500">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Salary</th>
                <th className="px-3 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_ROWS.map((r, i) => (
                <tr key={r[0]} className="h-[34px] border-b border-line last:border-0">
                  {i < rows ? (
                    r.map((c, j) => (
                      <td key={j} className={`animate-fade-up truncate px-3 ${j === 0 ? "text-zinc-200" : j === 3 ? "text-violet-300" : "text-zinc-400"}`}>
                        {c}
                      </td>
                    ))
                  ) : (
                    <td colSpan={4} className="px-3">
                      <div className="h-2 w-2/3 rounded bg-white/[0.03]" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
