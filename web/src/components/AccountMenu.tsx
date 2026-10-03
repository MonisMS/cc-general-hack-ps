"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Home, Loader2, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";

function initials(name: string) {
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Signed-in user chip for the sidebar footer, with a menu that opens upward. */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setLeaving(true);
    await authClient.signOut();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  const user = data?.user;
  if (isPending) return <div className={`animate-pulse rounded-lg bg-zinc-50/[0.04] ${compact ? "h-8 w-8" : "h-11"}`} />;
  if (!user)
    return (
      <Link href="/auth/sign-in" className="flex h-9 items-center justify-center rounded-lg border border-line-strong text-[13px] text-zinc-200 hover:bg-zinc-50/[0.05]">
        Sign in
      </Link>
    );

  const name = user.name || user.email;
  const avatar = user.image ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote avatar from the auth provider
    <img src={user.image} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-700 text-[11px] font-semibold text-zinc-100" aria-hidden>
      {initials(name)}
    </span>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2.5 rounded-lg text-left transition hover:bg-zinc-50/[0.05] ${compact ? "p-0.5" : "glass px-2 py-1.5"}`}
        title={compact ? `${name} (${user.email})` : undefined}
      >
        {avatar}
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-zinc-100">{name}</span>
              <span className="block truncate text-[11px] text-zinc-500">{user.email}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`animate-fade-up absolute z-50 w-56 rounded-xl border border-line-strong bg-raised p-1.5 shadow-[0_16px_40px_-12px_var(--color-zinc-950)] ${compact ? "right-0 top-full mt-2" : "bottom-full left-0 mb-2"}`}
        >
          <div className="px-2.5 py-2">
            <div className="truncate text-[12.5px] font-medium text-zinc-100">{name}</div>
            <div className="truncate text-[11.5px] text-zinc-500">{user.email}</div>
          </div>
          <div className="my-1 h-px bg-zinc-50/[0.06]" />
          <Link role="menuitem" href="/" onClick={() => setOpen(false)} className="flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] text-zinc-300 hover:bg-zinc-50/[0.06] hover:text-zinc-50">
            <Home className="h-3.5 w-3.5" aria-hidden /> Home page
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={signOut}
            disabled={leaving}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[13px] text-zinc-300 hover:bg-danger/10 hover:text-danger-soft"
          >
            {leaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <LogOut className="h-3.5 w-3.5" aria-hidden />} Sign out
          </button>
        </div>
      )}
    </div>
  );
}
