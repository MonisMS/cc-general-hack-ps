// Until subscriptions and the MCP runtime repairs are ready, every account is locked.
// Keep this response independent of auth, the database, and the MCP transport.
export function mcpSubscriptionRequired(request: Request): Response {
  const body = {
    code: "MCP_SUBSCRIPTION_REQUIRED",
    error: "MCP access requires a paid subscription. Subscriptions are coming soon, so MCP connections are currently unavailable.",
  };
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    status: 402,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
