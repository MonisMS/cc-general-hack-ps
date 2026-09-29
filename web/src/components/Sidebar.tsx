"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Workflow as WorkflowIcon, Sparkles } from "lucide-react";
import { Logo } from "./Logo";

const NAV = [
  { href: "/", label: "New request", icon: Plus },
  { href: "/workflows", label: "Workflows", icon: WorkflowIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/5 bg-zinc-950/80 px-3 py-5 md:flex">
      <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
        <Logo />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-white">DataPilot</div>
          <div className="text-[11px] text-zinc-500">AI data intelligence</div>
        </div>
      </Link>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-white/[0.06] text-white"
                  : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-violet-400" : ""}`} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-xl border border-violet-500/15 bg-gradient-to-b from-violet-500/10 to-transparent p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-violet-300">
          <Sparkles className="h-3.5 w-3.5" /> Autonomous pipelines
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          Plan → collect → extract → validate → dedupe. Every record is traceable to its source.
        </p>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-zinc-950/90 px-4 py-3 backdrop-blur md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <Logo size={26} />
        <span className="text-sm font-semibold text-white">DataPilot</span>
      </Link>
      <nav className="flex gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs ${active ? "bg-white/[0.06] text-white" : "text-zinc-400"}`}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
