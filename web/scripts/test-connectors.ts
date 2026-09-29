import { CONNECTORS } from "../src/lib/connectors";
import type { ConnectorId } from "../src/lib/types";

const SAMPLES: Record<ConnectorId, string> = {
  remotive_jobs: "python",
  arbeitnow_jobs: "developer",
  remoteok_jobs: "engineer",
  hackernews: "AI agents",
  github_repos: "vector database",
  wikipedia: "semiconductor companies",
  web_search: "Next.js conference 2026 sponsors",
  url_fetch: "https://nextjs.org/showcase",
  coingecko: "bitcoin ethereum solana",
};

async function main() {
  const only = process.argv.slice(2);
  for (const [id, c] of Object.entries(CONNECTORS) as [ConnectorId, (typeof CONNECTORS)[ConnectorId]][]) {
    if (only.length && !only.includes(id)) continue;
    const t0 = Date.now();
    try {
      const r = await c.run(SAMPLES[id], 5);
      const first = r.items[0];
      console.log(
        `OK   ${id.padEnd(15)} ${String(r.items.length).padStart(2)} items ${Date.now() - t0}ms | ${first ? `${first.title.slice(0, 60)} | ${first.url} | text ${first.text.length}ch` : "(none)"}`,
      );
    } catch (e) {
      console.log(`FAIL ${id.padEnd(15)} ${Date.now() - t0}ms | ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

main();
