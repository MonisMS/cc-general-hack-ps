// Shared contracts between the pipeline, API routes and UI.

export type WorkflowStatus =
  | "queued"
  | "planning"
  | "collecting"
  | "processing"
  | "completed"
  | "failed";

export type FieldType = "string" | "number" | "url" | "date" | "email" | "list";

export interface FieldSpec {
  name: string; // snake_case key used in record.data
  type: FieldType;
  description: string;
  required?: boolean;
}

export type ConnectorId =
  | "remotive_jobs"
  | "arbeitnow_jobs"
  | "remoteok_jobs"
  | "hackernews"
  | "github_repos"
  | "wikipedia"
  | "web_search"
  | "url_fetch"
  | "coingecko";

export interface SourceStep {
  connector: ConnectorId;
  query: string; // search terms, or a URL for url_fetch
  limit?: number;
  reason?: string; // why the planner picked it (shown in UI)
}

export interface WorkflowPlan {
  title: string;
  intent: string; // one-line restatement of what the user wants
  entity: string; // e.g. "job posting", "company", "sponsor"
  fields: FieldSpec[];
  sources: SourceStep[];
  filters: string[]; // plain-English constraints applied during validation
  dedupe_on: string[]; // field names forming the dedupe key
  max_results: number;
  planner: "llm" | "heuristic";
}

/** What every connector returns: one raw item per document/listing it found. */
export interface RawItem {
  source: ConnectorId;
  url: string; // canonical URL for traceability
  title: string;
  text: string; // body/snippet for extraction (trim to ~4k chars)
  /** Already-structured fields when the source is an API (jobs, repos...). */
  fields?: Record<string, unknown>;
  published_at?: string;
}

export interface ConnectorResult {
  items: RawItem[];
  url?: string; // the request URL we hit (for the Sources tab)
}

export interface Workflow {
  id: string;
  prompt: string;
  title: string | null;
  status: WorkflowStatus;
  plan: WorkflowPlan | null;
  progress: number;
  stats: {
    raw?: number;
    extracted?: number;
    valid?: number;
    duplicates?: number;
    invalid?: number;
    stored?: number;
    sources_ok?: number;
    sources_failed?: number;
  };
  error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  record_count?: number;
}

export interface WorkflowEvent {
  id: number;
  step: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  created_at: string;
}

export interface DataRecord {
  id: number;
  data: Record<string, unknown>;
  source_name: string;
  source_url: string | null;
  confidence: number;
  fetched_at: string;
}

export interface SourceRun {
  id: number;
  connector: string;
  query: string | null;
  url: string | null;
  status: "ok" | "failed" | "skipped";
  items: number;
  duration_ms: number | null;
  error: string | null;
}
