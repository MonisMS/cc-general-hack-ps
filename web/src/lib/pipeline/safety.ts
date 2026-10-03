// Requests DataPilot refuses to build a dataset for. Two layers: this fast pattern check runs before anything
// is created (and covers the rule-based planner, which has no judgement), and the LLM planner can reject what
// the patterns miss. A rejection fails the workflow with the reason instead of quietly reinterpreting it.

export class RejectedRequestError extends Error {}

export const REJECTION_MESSAGE =
  "DataPilot builds business datasets from public sources (companies, jobs, products, events, public figures), so it can't run this request.";

const RULES: [RegExp, string][] = [
  [
    /\b(porn\w*|xxx|nsfw|nudes?|nudity|naked|onlyfans|camgirls?|escort (services?|agenc\w*|girls?)|call ?girls?|hookups?|sexy|sex (videos?|chats?|workers?|cams?)|erotic\w*|fetish\w*|strip ?clubs?|brothels?|prostitut\w*|adult (sites?|websites?|content|videos?|stars?|actress(es)?|services?))\b/i,
    "it asks for sexual or adult content",
  ],
  [
    /\b(hot|sexy|cute|beautiful|pretty|attractive|single|horny|busty|curvy)\s+(girls?|gals?|women|woman|ladies|lady|chicks?|babes?|boys?|guys?|men|dudes?|aunt(y|ies)|bhabhi|models?)\b/i,
    "it rates people by looks or targets them as dating or sexual prospects",
  ],
  [/\b(girls?|women|chicks?|babes?|singles?)\s+(near me|nearby|around me|in my area)\b/i, "it asks to find private individuals near you"],
  [
    /\b(home address(es)?|phone numbers? of|personal (phone|address|details) of|where does .{1,40} live|track (my|a|her|his) )/i,
    "it asks for private personal details about individuals",
  ],
];

/** Why this prompt is refused, or null when it may run. */
export function blockedReason(prompt: string): string | null {
  for (const [re, why] of RULES) if (re.test(prompt)) return `${REJECTION_MESSAGE} Reason: ${why}.`;
  return null;
}
