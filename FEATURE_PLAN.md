# Feature plan: finals (2026-10-11)

This list comes from research on rival PS01 repos (Scout, Magpie, Quarry, DataIntel…) and on commercial tools (Exa Websets, Parallel FindAll, Clay, Firecrawl, Bright Data). Each feature was then checked against our code. Paths are under `web/src/`. Hours are for one dev, minimal demo-safe version.

## Fix first (bugs that block these features)
- [ ] **Non-Latin quotes are always "verified".** `squash()` in `lib/pipeline/extract.ts:18` strips every non a-z character, so a Hindi/CJK quote becomes `""` and `includes("")` is true. Fix: Unicode-aware squash (`\p{L}\p{N}`, `u` flag), keep ₹, and require a squashed quote of at least 8 characters.
- [ ] **Refresh erases good values.** `validate.ts:259` writes `null` for fields the LLM missed, and the upsert `data || EXCLUDED.data` (`run.ts:28`) overwrites the old value. Fix: drop null keys from the new data before merging.

## Shared pitfalls
- **LLM output budget.** Each extra thing asked per row makes the answer longer. Longer answers get truncated, which triggers the halving retry and eats into the 230s run budget. Keep additions tiny.
- **Stats are replaced wholesale.** `setStatus` replaces `stats` entirely (`db.ts:299`), so new live counters must live in the one `stats` object in `run.ts`.
- **Schema changes are manual.** `schema.sql` is applied by hand. Apply it before deploying, and wrap new-table writes in try/catch so a missing table can't fail a run.
- **Old data.** Shared examples and old rows lack the new keys, so the UI must degrade quietly.
- **File ownership.** See `AUDIT_TASKS_2026-10-11.md`. Agree before editing someone else's file.

## Features (in build order)

### 1. Criteria columns: ✓/✗/? per criterion with a reason (~6h): IN PROGRESS (Monis)
- Each plan filter becomes an icon column, and clicking a cell shows the reason and source link.
- Traps:
  - Checks are positional today, so one skipped check shifts every later verdict (this is audit #19, fixed here).
  - Popovers get clipped by the scrolling table.
  - Hover doesn't work on touch screens.
  - Old rows have no reasons.
  - Keyword-fallback rows must show "not checked", not ✗.

### 2. Funnel and stop reason (~2.5h)
- Example: "312 candidates → 140 evaluated → 47 matched, stopped: row limit".
- Traps:
  - Not counted today: the MAX_RAW cap and URL repeats (`run.ts:176-184`), items the LLM skipped, and the `max_results` cut (`validate.ts:326`).
  - Three different drop reasons are lumped into `irrelevant`.
  - A failed detail filter is "flagged", not dropped.
  - Store the counts in `stats.funnel` with a run-guarded write. Don't set `stats.valid` early, because it moves the Pipeline step.
- Phase 2: a `rejected_rows` table and a "show rejected" toggle (+4h).

### 3. Cost and latency meter (~3h)
- LLM calls, retries, tokens in/out, provider and model, ≈USD, pages fetched, seconds per stage. Shown live in Mission Control.
- Traps:
  - `llmUsage` in `llm.ts:32` is module-global and shared by concurrent runs, cron, Ask and AI columns. Use AsyncLocalStorage per run.
  - Count attempts and calls separately.
  - Pass provider and model into `count()`.
  - Planner cost is lost today, because `executePlan` resets stats.
  - USD is a list-price estimate only ($0 on the free tier).

### 4. Per-cell source check, code-only (~6h)
- No prompt change. Check each cleaned value against the page text:
  - numbers with tolerance ("$4M" = 4,000,000, "12 LPA"),
  - strings via squash,
  - lists item by item.
- API fields get an "API" badge. Store `_cell_ev: {field: "found"|"api"|"not_found"}` and show a dot per cell.
- Traps:
  - Dates like "3 days ago" can never match the stored date, so mark them "derived".
  - Quotes in the search haystack: strip `_` keys from table search.
  - Payload size.
- Full version (an LLM quote per field) is 14–20h and risks truncation, so skip it.

### 5. MCP server (~6h)
- `/api/mcp` using `mcp-handler@2.x` (needs `zod ^4.2`, Streamable HTTP, no Redis). Tools:
  - `list_datasets`
  - `get_status`
  - `get_rows`
  - `create_dataset`
  - `ask_dataset`
- Needs:
  - An `api_tokens` table (SHA-256, `dp_` prefix, shown once) and a create/revoke UI.
  - An `authorizeUser(user, id, mode)` split from `authorize()`.
  - Route logic moved into `lib/datasets.ts`.
- Claude Desktop needs `mcp-remote` to send the header.
- Test for free: unset the LLM and Firecrawl keys, which gives the heuristic planner and free scrapers.

### 6. Refresh diffs and versions (~4h)
- Changed badge with "was: X", and a `record_versions` snapshot per run.
- Traps:
  - Old values are already overwritten by live upserts, so read a "before" map at the start.
  - Unstable dedupe keys make rows look removed and then new again.
  - Reworded descriptions always look changed, so skip free-text fields.
  - "Not seen this run" is not the same as "removed".

### 7. Preview 5 rows before running (~3.5h)
- Keep the status `review`.
- Call the connector directly; `collectStep` writes to `sources`.
- Return rows in the response only.
- Use one batch, a sync route with a 120s limit, and count it as `ai` usage.

### Not before finals
- **Coverage estimate (Chao2).** Plans with 1–3 dependent sources and fuzzy keys give absurd numbers (e.g. ~627). Show "N of M seen by only one source" instead.
- **Multi-hop list → detail pages.** Biggest risk to the 300s limit and Firecrawl credits. If it's ever built, put it behind `MULTI_HOP=1`.
