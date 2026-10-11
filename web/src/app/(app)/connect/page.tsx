"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound, Loader2, Plug, Trash2 } from "lucide-react";
import { fetchJSON, timeAgo } from "@/components/utils";
import type { ApiKey } from "@/lib/auth/api-keys";

// "Connect your AI": create personal API keys and copy setup for each MCP client.

type Client = { id: string; name: string; steps: string[]; snippet?: (url: string, key: string) => string; urlOnly?: boolean };

const CLIENTS: Client[] = [
  {
    id: "claude",
    name: "Claude (web & desktop)",
    urlOnly: true,
    steps: [
      "Open Settings → Connectors → Add custom connector.",
      "Name it DataPilot and paste the server URL below (it includes your key).",
      "In a chat, turn DataPilot on from the tools menu.",
    ],
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    urlOnly: true,
    steps: [
      "Open Settings → Apps & Connectors → Advanced settings and turn on Developer mode.",
      "Create a connector: name DataPilot, MCP server URL below, authentication: none (the key is in the URL).",
      "In a chat, pick DataPilot from the + menu under Developer mode.",
    ],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    steps: ["Run this in your terminal, then start claude and ask for a dataset."],
    snippet: (url, key) => `claude mcp add --transport http datapilot ${url} --header "Authorization: Bearer ${key}"`,
  },
  {
    id: "cursor",
    name: "Cursor",
    steps: ["Add this to ~/.cursor/mcp.json (or .cursor/mcp.json in a project), then enable DataPilot in Settings → MCP."],
    snippet: (url, key) => JSON.stringify({ mcpServers: { datapilot: { url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
  },
  {
    id: "vscode",
    name: "VS Code",
    steps: ["Add this to .vscode/mcp.json, then start the server from the file or the MCP view (Copilot agent mode)."],
    snippet: (url, key) => JSON.stringify({ servers: { datapilot: { type: "http", url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
  },
  {
    id: "other",
    name: "Any other client",
    steps: ["Clients that only run local (stdio) servers can bridge to DataPilot with mcp-remote:"],
    snippet: (url, key) => `npx -y mcp-remote ${url}?key=${key}`,
  },
];

const TOOLS = [
  ["datapilot_create_dataset", "Build a new source-backed dataset from a plain-English request"],
  ["datapilot_get_status", "Follow a run live: stage, progress, rows so far"],
  ["datapilot_get_rows", "Rows with source links, evidence quotes and per-criterion verdicts (JSON or CSV)"],
  ["datapilot_ask", "Ask questions about a dataset; answers cite the rows they used"],
  ["datapilot_list_datasets", "Your datasets and the shared examples"],
];

const TRY = [
  "Use DataPilot to find remote React developer jobs posted in the last 7 days that are open to India, then tell me which pay the most.",
  "With DataPilot, build a table of the top 20 open-source vector databases on GitHub with stars and license, and give it to me as CSV.",
  "List my DataPilot datasets and summarise the latest one.",
];

function CopyBox({ value, label, multiline = false }: { value: string; label: string; multiline?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative mt-2 rounded-lg border border-white/10 bg-black/40">
      <pre className={`overflow-x-auto px-3 py-2.5 pr-20 font-mono text-[12px] leading-relaxed text-zinc-200 ${multiline ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}>{value}</pre>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() =>
          navigator.clipboard?.writeText(value).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          })
        }
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11.5px] text-zinc-300 hover:text-zinc-50"
      >
        {done ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function ConnectPage() {
  const [origin, setOrigin] = useState("");
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null); // the key just created: shown once
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState(CLIENTS[0].id);

  const load = useCallback(async () => {
    try {
      setKeys((await fetchJSON<{ keys: ApiKey[] }>("/api/keys")).keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your keys");
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin); // eslint-disable-line react-hooks/set-state-in-effect -- the browser's origin is only known after mount
    load();
  }, [load]);

  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchJSON<{ key: string }>("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "MCP key" }),
      });
      setFresh(res.key);
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a key");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: number) {
    setError(null);
    try {
      await fetchJSON(`/api/keys/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't revoke the key");
    }
  }

  const url = `${origin}/api/mcp`;
  const key = fresh ?? "YOUR_API_KEY";
  const c = CLIENTS.find((x) => x.id === client)!;
  const local = /localhost|127\.0\.0\.1/.test(origin);
  const active = keys?.filter((k) => !k.revoked_at) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-2 text-[12px] uppercase tracking-wider text-zinc-500">
        <Plug className="h-3.5 w-3.5" aria-hidden /> MCP server
      </div>
      <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-zinc-50">Connect your AI assistant</h1>
      <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-zinc-400">
        Use DataPilot from Claude, ChatGPT, Cursor, VS Code or any MCP client. Your assistant can build source-backed datasets, follow them live,
        read the rows and ask questions about them, with the same sources, checks and limits as this app.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-[13px] text-danger-soft">
          {error}
        </p>
      )}

      {/* 1. Key */}
      <section className="glass mt-6 rounded-xl p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-medium text-zinc-100">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-white/10 text-[11px]">1</span> Create an API key
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Key name, e.g. Claude on my laptop"
            aria-label="Key name"
            className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-zinc-950/70 px-3 text-[13.5px] text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-400 focus:outline-none"
          />
          <button type="submit" disabled={busy} className="btn-glow inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[13.5px] font-medium disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />} Create key
          </button>
        </form>

        {fresh && (
          <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Copy this key now. It won&apos;t be shown again.
            </p>
            <CopyBox value={fresh} label="API key" />
            <p className="mt-2 text-[12px] text-zinc-500">The setup snippets below already include it.</p>
          </div>
        )}

        <div className="mt-4">
          {keys === null ? (
            <div className="h-10 animate-pulse rounded-lg bg-white/[0.03]" />
          ) : keys.length === 0 ? (
            <p className="text-[12.5px] text-zinc-500">No keys yet.</p>
          ) : (
            <ul className="divide-y divide-white/5 rounded-lg border border-white/5">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
                  <KeyRound className={`h-3.5 w-3.5 shrink-0 ${k.revoked_at ? "text-zinc-700" : "text-zinc-400"}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate ${k.revoked_at ? "text-zinc-600 line-through" : "text-zinc-200"}`}>{k.name}</div>
                    <div className="font-mono text-[11.5px] text-zinc-500">
                      {k.prefix}… · created {timeAgo(k.created_at)} · {k.revoked_at ? `revoked ${timeAgo(k.revoked_at)}` : k.last_used_at ? `last used ${timeAgo(k.last_used_at)}` : "never used"}
                    </div>
                  </div>
                  {!k.revoked_at && (
                    <button
                      type="button"
                      onClick={() => revoke(k.id)}
                      aria-label={`Revoke ${k.name}`}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-zinc-500 hover:bg-danger/10 hover:text-danger-soft"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {active.length > 0 && !fresh && (
            <p className="mt-2 text-[12px] text-zinc-500">Keys are only shown once. Lost one? Revoke it and create a new key.</p>
          )}
        </div>
      </section>

      {/* 2. Client */}
      <section className="glass mt-4 rounded-xl p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-medium text-zinc-100">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-white/10 text-[11px]">2</span> Add DataPilot to your assistant
        </h2>
        <div role="tablist" aria-label="AI clients" className="mt-3 flex flex-wrap gap-1.5">
          {CLIENTS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={client === x.id}
              onClick={() => setClient(x.id)}
              className={`rounded-full border px-3 py-1 text-[12.5px] transition ${
                client === x.id ? "border-zinc-300 bg-zinc-50 text-zinc-950" : "border-white/10 text-zinc-300 hover:text-zinc-50"
              }`}
            >
              {x.name}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="mt-4">
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-zinc-300">
            {c.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {c.urlOnly ? (
            <>
              <CopyBox value={`${url}?key=${key}`} label="server URL" />
              {local && (
                <p className="mt-2 text-[12px] text-amber-200/80">
                  This is a localhost URL: {c.name} connects from the cloud, so use the deployed app&apos;s URL instead.
                </p>
              )}
            </>
          ) : (
            <CopyBox value={c.snippet!(url, key)} label={`${c.name} setup`} multiline />
          )}
          {!fresh && <p className="mt-2 text-[12px] text-zinc-500">Replace YOUR_API_KEY with your key, or create a new key above to fill it in.</p>}
        </div>
      </section>

      {/* 3. Try */}
      <section className="glass mt-4 rounded-xl p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-medium text-zinc-100">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-white/10 text-[11px]">3</span> Ask your assistant
        </h2>
        <div className="mt-2 space-y-2">
          {TRY.map((t) => (
            <CopyBox key={t} value={t} label="example prompt" multiline />
          ))}
        </div>
        <details className="mt-4 text-[13px]">
          <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">Tools your assistant gets</summary>
          <ul className="mt-2 space-y-1.5">
            {TOOLS.map(([n, d]) => (
              <li key={n} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <code className="shrink-0 font-mono text-[12px] text-zinc-200">{n}</code>
                <span className="text-zinc-500">{d}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
