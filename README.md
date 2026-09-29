# DataPilot: AI-powered data intelligence platform

Describe the data you need in plain English. DataPilot's agents plan a collection workflow, pull from permitted sources, then structure, validate and deduplicate the results into a source-backed dataset you can explore and export.

## How it works

```
prompt ──▶ Planning agent (LLM) ──▶ workflow plan: schema + source steps + filters
            │
            ▼
        Collectors (parallel, robots.txt-aware, public APIs)
        remotive · arbeitnow · remoteok · hackernews · github · wikipedia · coingecko · web search · url fetch
            │
            ▼
        Extraction agent (LLM, batched) ──▶ rows matching the schema, with relevance score
            │
            ▼
        Validator: type coercion, required fields, URL/email/date checks, dedupe + merge, confidence score
            │
            ▼
        Neon Postgres: workflows · events · sources · records (each row keeps source + URL + fetched_at)
            │
            ▼
        Dashboard: live progress, pipeline view, data table (search/filter/sort), sources, activity log, CSV/JSON export, rerun
```

## Stack
- `web/`: Next.js 16 (App Router) with the UI and API routes. The pipeline runs in the background via `after()` on Vercel.
- Neon serverless Postgres for workflow, dataset and history storage.
- LLM provider: set one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY` (optionally `LLM_MODEL`). If none is set, a rule-based planner and heuristic field mapping take over, so the app still works.

## Run locally
```bash
cd web
pnpm install
# .env.local: DATABASE_URL=... and an LLM key
pnpm dev
```

Database schema: see `web/schema.sql`.
