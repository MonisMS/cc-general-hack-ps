import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, ExternalLink, HelpCircle, Minus, X } from "lucide-react";
import { CHECK_REASONS_KEY, CHECK_SOURCES_KEY, CHECKS_KEY, METHOD_KEY, type DataRecord } from "@/lib/types";
import { hostOf } from "@/components/utils";

// One column per plan filter: ✓ met, ✗ not met, ? the source doesn't say, — not checked. Clicking a cell opens a
// popover with the AI's reason and the page it judged from.

export type Verdict = boolean | null | undefined; // undefined = this row has no verdicts at all

export interface CriterionInfo {
  verdict: Verdict;
  reason: string | null;
  url: string | null; // the page the verdict was judged from
  keyword: boolean; // the row came from the keyword fallback, so nothing was checked
}

export function criterionOf(r: DataRecord, i: number): CriterionInfo {
  const checks = Array.isArray(r.data[CHECKS_KEY]) ? (r.data[CHECKS_KEY] as (boolean | null)[]) : null;
  const reasons = Array.isArray(r.data[CHECK_REASONS_KEY]) ? (r.data[CHECK_REASONS_KEY] as (string | null)[]) : null;
  const from = (r.data[CHECK_SOURCES_KEY] as Record<string, string> | undefined)?.[i];
  const v = checks?.[i];
  return {
    verdict: checks ? (typeof v === "boolean" ? v : null) : undefined,
    reason: typeof reasons?.[i] === "string" && reasons[i] ? reasons[i] : null,
    url: from ?? r.source_url,
    keyword: r.data[METHOD_KEY] === "keyword",
  };
}

/** Sort value for a criterion column: met first, then not stated, then not met; rows without verdicts last. */
export function criterionRank(r: DataRecord, i: number): number | null {
  const { verdict } = criterionOf(r, i);
  return verdict === undefined ? null : verdict === true ? 0 : verdict === null ? 1 : 2;
}

const LABEL = { met: "Met", miss: "Not met", unknown: "Not stated in source", none: "Not checked" } as const;

function labelOf(c: CriterionInfo) {
  return c.verdict === true ? LABEL.met : c.verdict === false ? LABEL.miss : c.verdict === null ? LABEL.unknown : LABEL.none;
}

export function VerdictIcon({ verdict, className = "h-3.5 w-3.5" }: { verdict: Verdict; className?: string }) {
  if (verdict === true) return <Check className={`${className} text-success`} aria-hidden />;
  if (verdict === false) return <X className={`${className} text-danger`} aria-hidden />;
  if (verdict === null) return <HelpCircle className={`${className} text-zinc-500`} aria-hidden />;
  return <Minus className={`${className} text-zinc-700`} aria-hidden />;
}

export type OpenCriterion = { record: DataRecord; index: number; anchor: HTMLElement };

/** Table cell: the verdict icon as a button. Clicks never reach the row, which would open the record drawer. */
export function CriterionCell({
  record,
  index,
  criterion,
  active,
  onOpen,
}: {
  record: DataRecord;
  index: number;
  criterion: string;
  active: boolean;
  onOpen: (o: OpenCriterion | null) => void;
}) {
  const c = criterionOf(record, index);
  return (
    <button
      type="button"
      aria-label={`${criterion}: ${labelOf(c)}. Show details`}
      aria-expanded={active}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(active ? null : { record, index, anchor: e.currentTarget });
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={`grid h-6 w-6 place-items-center rounded-md transition hover:bg-zinc-50/[0.08] ${active ? "bg-zinc-50/[0.1]" : ""}`}
    >
      <VerdictIcon verdict={c.verdict} />
    </button>
  );
}

const WIDTH = 288;
const GAP = 6;

/** One popover for the whole table, in a portal so the table's scroll container can't clip it. */
export function CriterionPopover({ open, criteria, onClose }: { open: OpenCriterion | null; criteria: string[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // place it under the cell, or above when there's no room below; inside the viewport either way. Written to the
  // DOM before paint, so it never shows at a wrong spot first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const a = open.anchor.getBoundingClientRect();
    const width = Math.min(WIDTH, window.innerWidth - 16);
    const above = a.bottom + GAP + el.offsetHeight > window.innerHeight && a.top > el.offsetHeight + GAP;
    Object.assign(el.style, {
      width: `${width}px`,
      left: `${Math.max(8, Math.min(a.left + a.width / 2 - width / 2, window.innerWidth - width - 8))}px`,
      top: above ? "" : `${a.bottom + GAP}px`,
      bottom: above ? `${window.innerHeight - a.top + GAP}px` : "",
      visibility: "visible",
    });
  }, [open]);

  // the cell left the page (next page, filtered out, refreshed away): the popover would point at nothing
  useEffect(() => {
    if (open && !open.anchor.isConnected) onClose();
  });

  // close on Escape (focus back to the cell), a click elsewhere, or any scroll/resize that would detach it
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
      open.anchor.focus();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !open.anchor.contains(t)) onClose();
    };
    const onMove = () => onClose();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, onClose]);

  if (!open) return null;
  const c = criterionOf(open.record, open.index);
  const host = hostOf(c.url);
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`Criterion: ${criteria[open.index] ?? ""}`}
      style={{ position: "fixed", width: WIDTH, left: 0, top: 0, visibility: "hidden" }}
      className="animate-fade-up z-[60] rounded-xl border border-white/10 bg-zinc-950 p-3 text-left shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
        <VerdictIcon verdict={c.verdict} />
        {labelOf(c)}
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-zinc-300">{criteria[open.index] ?? `Criterion ${open.index + 1}`}</p>
      {c.verdict === undefined ? (
        <p className="mt-2 text-[12px] text-zinc-500">
          {c.keyword ? "The AI was unavailable for this row, so it was matched by keywords and no criterion was checked." : "The AI gave no verdict for this row."}
        </p>
      ) : c.reason ? (
        <p className="mt-2 rounded-md bg-white/[0.04] px-2 py-1.5 text-[12.5px] text-zinc-200">“{c.reason}”</p>
      ) : (
        c.verdict !== null && <p className="mt-2 text-[12px] text-zinc-500">No reason recorded for this row.</p>
      )}
      {c.verdict !== undefined && (
        <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
          <span>AI judgment, not checked in code</span>
          {host && (
            <a href={c.url!} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-zinc-400 hover:text-accent-soft">
              <span className="truncate">{host}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
