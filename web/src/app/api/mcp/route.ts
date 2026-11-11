import { mcpSubscriptionRequired } from "@/lib/mcp/access";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

// Deny before loading the MCP implementation or verifying any existing API key.
export {
  mcpSubscriptionRequired as GET,
  mcpSubscriptionRequired as POST,
  mcpSubscriptionRequired as PUT,
  mcpSubscriptionRequired as PATCH,
  mcpSubscriptionRequired as DELETE,
  mcpSubscriptionRequired as HEAD,
  mcpSubscriptionRequired as OPTIONS,
};
