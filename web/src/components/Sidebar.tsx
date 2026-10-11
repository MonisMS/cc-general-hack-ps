"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Layers, Loader2, MoreHorizontal, PenSquare, Pin, PinOff, Trash2 } from "lucide-react";
import type { Workflow } from "@/lib/types";
import { Logo } from "./Logo";
import { StatusIcon } from "./StatusBadge";
import { AccountMenu } from "./AccountMenu";
import { fetchJSON, isRunning } from "./utils";

function useWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    let alive = true;
    let anyRunning = true;
    let last = 0;
    const load = () =>
      fetchJSON<{ workflows: Workflow[] }>("/api/workflows")
        .then((j) => {
          if (!alive) return;
          setWorkflows(j.workflows ?? []);
          anyRunning = (j.workflows ?? []).some((w) => isRunning(w.status));
        })
        .catch(() => {}); // keep last good list; retry on next tick
    load();
    // every 5s while something runs, every 30s otherwise, never in a hidden tab: each poll wakes the database
    const t = setInterval(() => {
      if (document.hidden || Date.now() - last < (anyRunning ? 5000 : 30_000)) return;
      last = Date.now();
      load();
    }, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname]);
  return [workflows, setWorkflows] as const;
}

// same order as GET /api/workflows, so an optimistic pin lands where the next poll puts it
const byPinThenNew = (a: Workflow, b: Workflow) =>
  Number(!a.pinned_at) - Number(!b.pinned_at) ||
  (b.pinned_at ?? "").localeCompare(a.pinned_at ?? "") ||
  Number(!a.owner_id) - Number(!b.owner_id) ||
  b.created_at.localeCompare(a.created_at);

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [workflows, setWorkflows] = useWorkflows();

  async function togglePin(w: Workflow) {
    const pinned_at = w.pinned_at ? null : new Date().toISOString();
    const set = (v: string | null) => setWorkflows((ws) => ws && ws.map((x) => (x.id === w.id ? { ...x, pinned_at: v } : x)).sort(byPinThenNew));
    set(pinned_at);
    try {
      await fetchJSON(`/api/workflows/${w.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ pinned: !!pinned_at }) });
    } catch {
      set(w.pinned_at ?? null); // undo; the next poll would too
    }
  }

  async function remove(w: Workflow) {
    await fetchJSON(`/api/workflows/${w.id}`, { method: "DELETE" }); // throws the 409 "still running" text for the menu to show
    setWorkflows((ws) => ws && ws.filter((x) => x.id !== w.id));
    if (pathname === `/workflows/${w.id}`) router.push("/workflows");
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-[244px] shrink-0 flex-col bg-[linear-gradient(to_bottom,var(--color-sidebar)_0%,var(--color-sidebar)_62%,color-mix(in_oklab,var(--color-sidebar)_55%,transparent)_100%)] px-2.5 py-3 md:flex">
      <div className="flex items-center justify-between px-1.5">
        <Link href="/" className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-white/[0.04]">
          <Logo size={20} />
          <span className="text-[13.5px] font-semibold text-zinc-100">DataPilot</span>
        </Link>
        <Link
          href="/new"
          title="New request"
          className="grid h-7 w-7 place-items-center rounded-md border border-line-strong bg-raised text-zinc-300 hover:text-zinc-100"
        >
          <PenSquare className="h-3.5 w-3.5" />
        </Link>
      </div>

      <nav className="mt-4 flex flex-col gap-px">
        <NavItem href="/new" active={pathname === "/new"} icon={<PenSquare className="h-3.5 w-3.5" />}>
          New request
        </NavItem>
        <NavItem
          href="/workflows"
          active={pathname === "/workflows"}
          icon={<Layers className="h-3.5 w-3.5" />}
          trailing={workflows?.length ? String(workflows.length) : undefined}
        >
          Workflows
        </NavItem>
      </nav>

      <Section title="Recent">
        {workflows === null ? (
          [0, 1, 2, 3].map((i) => <div key={i} className="mx-2 my-1.5 h-3.5 animate-pulse rounded bg-white/[0.04]" />)
        ) : workflows.length === 0 ? (
          <p className="px-2.5 py-1 text-[12px] text-zinc-600">No workflows yet</p>
        ) : (
          workflows.slice(0, 14).map((w, i) => (
            <RecentItem
              key={w.id}
              w={w}
              index={i}
              active={pathname === `/workflows/${w.id}`}
              onTogglePin={() => togglePin(w)}
              onDelete={() => remove(w)}
            />
          ))
        )}
      </Section>

      <div className="mt-auto pt-3">
        <AccountMenu />
      </div>
    </aside>
  );
}

function RecentItem({
  w,
  index,
  active,
  onTogglePin,
  onDelete,
}: {
  w: Workflow;
  index: number;
  active: boolean;
  onTogglePin: () => void;
  onDelete: () => Promise<void>;
}) {
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const mine = !!w.owner_id; // the list holds only the user's workflows plus shared examples (no owner), which are read-only

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true); // the menu is fixed, so on scroll it would drift off its row
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  function openMenu(e: React.MouseEvent<HTMLButtonElement>) {
    if (menu) return setMenu(null);
    const r = e.currentTarget.getBoundingClientRect();
    setConfirming(false);
    setError(null);
    setMenu({ top: r.bottom + 4, left: r.left }); // fixed, not absolute: the Recent list scrolls and would clip it
  }

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  const iconBtn = "grid h-5 w-5 shrink-0 place-items-center rounded text-zinc-500 hover:bg-white/[0.08] hover:text-zinc-200";
  const item = "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[13px] text-zinc-300";
  return (
    <div
      ref={ref}
      style={{ animationDelay: `${index * 35}ms` }}
      className={`animate-fade-up group flex h-7 items-center rounded-md text-[12.5px] font-medium ${
        active || menu ? "bg-white/[0.07] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
      }`}
    >
      <Link href={`/workflows/${w.id}`} title={w.prompt} className="flex h-full min-w-0 flex-1 items-center gap-2 pl-2.5 pr-1">
        <StatusIcon status={w.status} size={12} mono={w.status === "completed"} />
        <span className="min-w-0 flex-1 truncate">{w.title || w.prompt}</span>
        {w.status === "completed" && (
          <span className={`font-mono text-[10.5px] tabular-nums text-zinc-600 ${mine ? "group-focus-within:hidden group-hover:hidden" : ""} ${menu ? "hidden" : ""}`}>
            {w.record_count ?? 0}
          </span>
        )}
      </Link>
      {mine && (
        <div className={`items-center gap-0.5 pr-1.5 group-focus-within:flex group-hover:flex [@media(hover:none)]:flex ${menu ? "flex" : "hidden"}`}>
          <button type="button" aria-label="More actions" aria-haspopup="menu" aria-expanded={!!menu} onClick={openMenu} className={iconBtn}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label={w.pinned_at ? "Unpin" : "Pin"} title={w.pinned_at ? "Unpin" : "Pin"} onClick={onTogglePin} className={iconBtn}>
            {w.pinned_at ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
      {mine && w.pinned_at && !menu && (
        <Pin aria-label="Pinned" className="mr-2 h-3 w-3 shrink-0 fill-current text-zinc-500 group-focus-within:hidden group-hover:hidden [@media(hover:none)]:hidden" />
      )}

      {menu && (
        <div
          role="menu"
          style={{ top: menu.top, left: menu.left }}
          className="animate-fade-up fixed z-50 w-52 rounded-xl border border-line-strong bg-raised p-1.5 shadow-[0_16px_40px_-12px_var(--color-zinc-950)]"
        >
          {confirming ? (
            <div className="px-1.5 py-1">
              <p className="mb-2 text-[12.5px] text-zinc-300">Delete with all records?</p>
              {error && <p className="mb-2 text-[12px] text-danger-soft">{error}</p>}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex h-7 items-center gap-1.5 rounded-md bg-danger/15 px-2.5 text-[12.5px] text-danger-soft hover:bg-danger/25"
                >
                  {deleting && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />} Delete
                </button>
                <button type="button" onClick={() => setMenu(null)} className="h-7 rounded-md px-2.5 text-[12.5px] text-zinc-400 hover:bg-white/[0.06]">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenu(null);
                  onTogglePin();
                }}
                className={`${item} hover:bg-zinc-50/[0.06] hover:text-zinc-50`}
              >
                {w.pinned_at ? <PinOff className="h-3.5 w-3.5" aria-hidden /> : <Pin className="h-3.5 w-3.5" aria-hidden />}
                {w.pinned_at ? "Unpin" : "Pin"}
              </button>
              <button role="menuitem" type="button" onClick={() => setConfirming(true)} className={`${item} hover:bg-danger/10 hover:text-danger-soft`}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 flex min-h-0 flex-col">
      <div className="mb-1 px-2.5 text-[11.5px] font-semibold text-zinc-500">{title}</div>
      <div className="flex min-h-0 flex-col gap-px overflow-y-auto">{children}</div>
    </div>
  );
}

function NavItem({
  href,
  active,
  icon,
  trailing,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  trailing?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex h-7 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium ${
        active ? "bg-white/[0.07] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
      }`}
    >
      <span className={active ? "text-zinc-200" : "text-zinc-500"}>{icon}</span>
      <span className="flex-1">{children}</span>
      {trailing && <span className="font-mono text-[11px] text-zinc-600">{trailing}</span>}
    </Link>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/90 px-4 py-2.5 backdrop-blur md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <Logo size={20} />
        <span className="text-[13.5px] font-semibold text-zinc-100">DataPilot</span>
      </Link>
      <nav className="flex items-center gap-1">
        {[
          { href: "/new", label: "New" },
          { href: "/workflows", label: "Workflows" },
        ].map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-md px-2.5 py-1 text-[12.5px] ${active ? "bg-white/[0.07] text-zinc-100" : "text-zinc-400"}`}
            >
              {label}
            </Link>
          );
        })}
        <span className="ml-1">
          <AccountMenu compact />
        </span>
      </nav>
    </header>
  );
}
