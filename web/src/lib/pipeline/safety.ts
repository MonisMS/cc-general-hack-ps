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
    // "hot" and "single" are left out of the models line: "hot models on Hugging Face" is about ML models
    /\b((hot|sexy|cute|beautiful|pretty|attractive|horny|busty|curvy)\s+(girls?|gals?|women|woman|ladies|lady|chicks?|babes?|boys?|guys?|men|dudes?|aunt(y|ies)|bhabhi)|(sexy|cute|beautiful|pretty|attractive|busty|curvy)\s+models?)\b/i,
    "it rates people by looks or targets them as dating or sexual prospects",
  ],
  [
    // "single women founders" is a business list; "single women in Delhi" is a dating one
    /\bsingle\s+(girls?|women|woman|ladies|lady|boys?|guys?|men)\b(?!\s+(founders?|ceos?|entrepreneurs?|leaders?|executives?|investors?|engineers?|developers?|scientists?|athletes?|authors?|business))/i,
    "it rates people by looks or targets them as dating or sexual prospects",
  ],
  [/\b(girls?|women|chicks?|babes?|singles?)\s+(near me|nearby|around me|in my area)\b/i, "it asks to find private individuals near you"],
  [
    // people only: "phone numbers of hospitals" and "track my competitors" are business data
    /\b(home address(es)?|personal (phone|address|email|details)|(phone|mobile|cell) numbers? of (my|her|his|girls?|women|men|people|someone|individuals)|where does .{1,40} live|track (her|him|someone|a person|my (ex|wife|husband|girlfriend|boyfriend|partner|crush|spouse))\b)/i,
    "it asks for private personal details about individuals",
  ],
  [
    // checked here too, so the rule-based planner (no LLM) can't run it
    /\b(pipe ?bombs?|nail bombs?|molotov cocktails?|napalm|ricin|sarin|nerve agents?)\b|\b(how (to|do i|can i)|instructions (for|to)|recipe for|homemade|(make|build) (a|an|my own))\b.{0,30}\b(?<!bath )(bombs?|explosives?|ieds?)\b/i,
    "it asks how to make weapons or explosives",
  ],
];

/** Why this prompt is refused, or null when it may run. */
export function blockedReason(prompt: string): string | null {
  for (const [re, why] of RULES) if (re.test(prompt)) return `${REJECTION_MESSAGE} Reason: ${why}.`;
  return null;
}
