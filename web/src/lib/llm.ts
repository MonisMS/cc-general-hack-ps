// Provider-agnostic JSON completion. Uses whichever key is configured:
// OPENROUTER_API_KEY → ANTHROPIC_API_KEY → OPENAI_API_KEY → GEMINI_API_KEY. Returns null when none is set
// so callers can fall back to heuristics.

export function llmProvider(): "openrouter" | "anthropic" | "openai" | "gemini" | null {
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

function parseJSON<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  }
}

export async function llmJSON<T>(system: string, user: string, maxTokens = 4096): Promise<T | null> {
  const provider = llmProvider();
  if (!provider) return null;
  const signal = AbortSignal.timeout(90_000);
  const sys = `${system}\n\nRespond with a single valid JSON value only. No prose, no markdown fences.`;

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system: sys,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    const text = body.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
    return parseJSON<T>(text);
  }

  if (provider === "openai" || provider === "openrouter") {
    const or = provider === "openrouter";
    const call = (tokens: number) =>
      fetch(or ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal,
        headers: {
          authorization: `Bearer ${or ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY}`,
          "content-type": "application/json",
          ...(or ? { "x-title": "DataPilot" } : {}),
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || (or ? "anthropic/claude-haiku-4.5" : "gpt-4o-mini"),
          max_tokens: tokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: sys + " Wrap arrays in an object." },
            { role: "user", content: user },
          ],
        }),
      });
    let res = await call(maxTokens);
    // OpenRouter answers 402 when the credit balance can't cover max_tokens; retry with what it can afford.
    if (res.status === 402) {
      const affordable = Number((await res.text()).match(/afford (\d+)/)?.[1] ?? 0);
      if (affordable >= 400) res = await call(Math.min(maxTokens, affordable - 50));
      else throw new Error("OpenRouter 402: out of credits");
    }
    if (!res.ok) throw new Error(`${or ? "OpenRouter" : "OpenAI"} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    return parseJSON<T>(body.choices?.[0]?.message?.content ?? "");
  }

  const model = process.env.LLM_MODEL || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return parseJSON<T>(body.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "");
}
