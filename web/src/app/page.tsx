"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  Brain,
  Building2,
  Coins,
  Database,
  Handshake,
  ListChecks,
  Loader2,
  MessagesSquare,
  Rocket,
  ShieldCheck,
  Sparkles,
  Download,
  Inbox,
} from "lucide-react";
import type { Workflow } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { fetchJSON, isRunning, timeAgo } from "@/components/utils";

const EXAMPLES = [
  { icon: Briefcase, label: "Remote jobs", prompt: "Find remote React developer jobs posted this week with salary info" },
  { icon: Rocket, label: "Sales leads", prompt: "AI startups on GitHub building developer tools" },
  { icon: Handshake, label: "Sponsors", prompt: "Find sponsor opportunities for a college hackathon in India" },
  { icon: Coins, label: "Market data", prompt: "Top 20 cryptocurrencies by market cap" },
  { icon: MessagesSquare, label: "Discussions", prompt: "Hacker News discussions about AI coding agents this month" },
  { icon: Building2, label: "Company list", prompt: "Largest Indian IT services companies" },
];

const STEPS = [
  { icon: Brain, title: "Understand", body: "Parses your request into intent, entity and constraints." },
  { icon: ListChecks, title: "Plan", body: "Designs a schema and picks the best data sources." },
  { icon: Download, title: "Collect", body: "Runs connectors in parallel across APIs and the web." },
  { icon: ShieldCheck, title: "Clean & validate", body: "Extracts, validates, dedupes and scores every record." },
];

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Workflow[] | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const loadRecent = useCallback(async () => {
    try {
      const j = await fetchJSON<{ workflows: Workflow[] }>("/api/workflows");
      setRecent((j.workflows ?? []).slice(0, 5));
    } catch {
      setRecent((r) => r ?? []);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch
    loadRecent();
    const t = setInterval(loadRecent, 5000);
    return () => clearInterval(t);
  }, [loadRecent]);

  async function submit() {
    const p = prompt.trim();
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
    <div className="relative">
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[520px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="pointer-events-none absolute left-1/2 top-[-160px] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[120px]" />

      <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-14 sm:px-6 md:pt-20">
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
            <Sparkles className="h-3.5 w-3.5" /> From plain English to a clean, source-backed dataset
          </span>
        </div>
        <h1 className="mt-5 text-center text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          What data do you{" "}
          <span className="bg-gradient-to-r from-violet-300 via-indigo-300 to-sky-300 bg-clip-text text-transparent">
            need today?
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-center text-[15px] leading-relaxed text-zinc-400">
          Describe it the way you&apos;d brief an analyst. DataPilot plans the workflow, collects from live sources,
          and delivers a deduplicated, validated table you can export.
        </p>

        {/* Prompt box */}
        <div className="mt-10 rounded-2xl bg-gradient-to-b from-white/10 to-white/[0.02] p-px shadow-2xl shadow-violet-950/40">
          <div className="rounded-2xl bg-zinc-900/90 backdrop-blur">
            <textarea
              ref={taRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={4}
              autoFocus
              placeholder="e.g. Find remote React developer jobs posted this week with salary info"
              className="block w-full resize-none bg-transparent px-5 pt-5 text-[15px] leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-2">
              <span className="hidden text-xs text-zinc-500 sm:block">
                <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">⌘</kbd>{" "}
                <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>{" "}
                to run
              </span>
              <button
                onClick={submit}
                disabled={!prompt.trim() || submitting}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-600/25 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {submitting ? "Planning…" : "Run workflow"}
              </button>
            </div>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

        {/* Examples */}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map(({ icon: Icon, label, prompt: p }) => (
            <button
              key={label}
              title={p}
              onClick={() => {
                setPrompt(p);
                taRef.current?.focus();
              }}
              className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-white"
            >
              <Icon className="h-3.5 w-3.5 text-zinc-500 group-hover:text-violet-300" />
              {label}
              <span className="hidden max-w-[220px] truncate text-zinc-500 group-hover:text-zinc-300 lg:inline">
                · {p}
              </span>
            </button>
          ))}
        </div>

        {/* How it works */}
        <div className="mt-16">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-zinc-500">How it works</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="relative rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <div className="grid h-7 w-7 place-items-center rounded-lg bg-violet-500/10 ring-1 ring-violet-500/20">
                    <Icon className="h-3.5 w-3.5 text-violet-300" />
                  </div>
                  <span className="font-mono text-[10px] text-zinc-600">0{i + 1}</span>
                </div>
                <div className="mt-3 text-sm font-medium text-zinc-100">{title}</div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{body}</p>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-zinc-700 lg:block" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recent */}
        <div className="mt-14">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Recent workflows</h2>
            <Link href="/workflows" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recent === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[68px] animate-pulse rounded-xl border border-white/5 bg-white/[0.02]" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-white/10 py-10 text-center">
              <Inbox className="h-6 w-6 text-zinc-600" />
              <p className="mt-2 text-sm text-zinc-400">No workflows yet</p>
              <p className="text-xs text-zinc-600">Pick an example above to run your first one.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((w) => (
                <Link
                  key={w.id}
                  href={`/workflows/${w.id}`}
                  className="group block rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition hover:border-violet-500/30 hover:bg-white/[0.04]"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] ring-1 ring-white/5">
                      <Database className="h-4 w-4 text-zinc-400 group-hover:text-violet-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-100">{w.title || w.prompt}</div>
                      <div className="truncate text-xs text-zinc-500">
                        {w.title ? `“${w.prompt}”` : ""}
                      </div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <div className="text-sm tabular-nums text-zinc-200">{w.record_count ?? 0}</div>
                      <div className="text-[10px] uppercase tracking-wide text-zinc-600">records</div>
                    </div>
                    <div className="flex w-28 flex-col items-end gap-1">
                      <StatusBadge status={w.status} />
                      <span className="text-[11px] text-zinc-600">{timeAgo(w.created_at)}</span>
                    </div>
                  </div>
                  {isRunning(w.status) && (
                    <div className="mt-2.5">
                      <ProgressBar value={w.progress} />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
