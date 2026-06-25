// Google Gemini (free-tier) client. Used instead of a paid LLM so the prototype
// runs at zero cost. Calls the stable v1beta `generateContent` REST endpoint
// directly via fetch — no SDK, so it's resilient to SDK churn.
//
// Set GEMINI_API_KEY (free key from https://aistudio.google.com/apikey).
// GEMINI_MODEL is optional; defaults to a free flash model.

const DEFAULT_MODEL = "gemini-2.0-flash";

function endpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

interface GeminiOpts {
  system: string;
  user: string;
  /** When true, ask Gemini to return application/json. */
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

// Logs the technical detail server-side, but throws a message that's safe to
// show a homeowner directly — callers just surface (e as Error).message as-is.
function failGemini(detail: string, userMessage: string): never {
  console.error(`Gemini call failed: ${detail}`);
  throw new Error(userMessage);
}

export async function geminiGenerate({
  system,
  user,
  json = false,
  maxOutputTokens = 8192,
  temperature = 0.4,
}: GeminiOpts): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on the server.");

  const generationConfig: Record<string, unknown> = { maxOutputTokens, temperature };
  if (json) generationConfig.responseMimeType = "application/json";

  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig,
  });

  // The free tier returns 429/503 ("high demand") often enough in practice
  // that a single attempt regularly fails for reasons that have nothing to
  // do with the request — a couple of quick retries clear most of them
  // before the user ever sees an error.
  const MAX_ATTEMPTS = 3;
  let res: Response | undefined;
  let body = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    res = await fetch(`${endpoint(geminiModel())}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    if (res.ok) break;
    body = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) break;
    console.warn(
      `Gemini attempt ${attempt}/${MAX_ATTEMPTS} got HTTP ${res.status}, retrying…`,
    );
    await new Promise((r) => setTimeout(r, attempt * 800));
  }

  if (!res!.ok) {
    const retryable = res!.status === 429 || res!.status >= 500;
    failGemini(
      `HTTP ${res!.status}: ${body.slice(0, 500)}`,
      retryable
        ? "Our AI planner is getting heavy traffic right now. Please try again in a moment."
        : "The AI planner couldn't process this request. Please try again.",
    );
  }

  const data = await res!.json();
  const cand = data?.candidates?.[0];
  if (!cand) {
    const reason = data?.promptFeedback?.blockReason || "no candidates returned";
    failGemini(
      `no candidates (${reason})`,
      "The AI planner couldn't generate a result for this request. Please try again.",
    );
  }
  if (cand.finishReason && !["STOP", "MAX_TOKENS"].includes(cand.finishReason)) {
    failGemini(
      `finishReason=${cand.finishReason}`,
      "The AI planner's response was cut off unexpectedly. Please try again.",
    );
  }
  const text: string = (cand.content?.parts || [])
    .map((p: { text?: string }) => p.text || "")
    .join("");
  if (!text.trim()) {
    failGemini("empty text", "The AI planner returned an empty response. Please try again.");
  }
  return text;
}

/** Parse Gemini JSON output, tolerating accidental ```json fences. */
export function parseGeminiJson<T>(raw: string): T {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }
  return JSON.parse(s) as T;
}
