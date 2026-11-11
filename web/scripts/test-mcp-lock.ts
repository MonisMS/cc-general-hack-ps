import assert from "node:assert/strict";
import { test } from "node:test";
import * as mcp from "../src/app/api/mcp/route";
import { POST as createKey } from "../src/app/api/keys/route";

async function assertLocked(response: Response, head = false) {
  assert.equal(response.status, 402);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("www-authenticate"), null);
  if (head) {
    assert.equal(await response.text(), "");
    return;
  }
  const reader = response.body!.getReader();
  let body = "";
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    body += decoder.decode(value, { stream: true });
  }
  const payload = JSON.parse(body);
  assert.equal(payload.code, "MCP_SUBSCRIPTION_REQUIRED");
  assert.match(payload.error, /coming soon/);
  assert.equal(payload.result, undefined);
}

test("all MCP methods return a completed subscription denial", { timeout: 2000 }, async () => {
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const) {
    await assertLocked(mcp[method](new Request("https://datapilot.test/api/mcp", { method })), method === "HEAD");
  }
});

test("existing key transports and session cookies cannot bypass the lock", { timeout: 2000 }, async () => {
  const key = "dp_" + "A".repeat(32);
  const credentials = [
    { suffix: "", headers: { authorization: `Bearer ${key}` } },
    { suffix: "", headers: { "x-api-key": key } },
    { suffix: `?key=${key}`, headers: {} },
    { suffix: `?api_key=${key}`, headers: {} },
    { suffix: "", headers: { cookie: "session=previously-issued-session" } },
  ];
  for (const { suffix, headers } of credentials) {
    await assertLocked(mcp.POST(new Request(`https://datapilot.test/api/mcp${suffix}`, {
      method: "POST", headers: headers as HeadersInit,
    })));
  }
});

test("discovery, subscriptions, tools, and malformed requests never reach MCP", { timeout: 2000 }, async () => {
  for (const method of ["initialize", "server/discover", "tools/list", "subscriptions/listen", "tools/call"]) {
    await assertLocked(mcp.POST(new Request("https://datapilot.test/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { name: "datapilot_create_dataset", arguments: { request: "offline test" } } }),
    })));
  }
  await assertLocked(mcp.POST(new Request("https://datapilot.test/api/mcp", { method: "POST", body: "not JSON" })));
});

test("new key creation is denied without consulting auth or parsing the body", { timeout: 2000 }, async () => {
  // No auth/database configuration is needed for the denial, even with an apparent session.
  for (const headers of [{}, { cookie: "session=previously-issued-session" }]) {
    await assertLocked(createKey(new Request("https://datapilot.test/api/keys", {
      method: "POST", headers: headers as HeadersInit, body: "not JSON",
    })));
  }
});
