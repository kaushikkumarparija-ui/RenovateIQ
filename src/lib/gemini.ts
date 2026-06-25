// Google Gemini (free-tier) client. Used instead of a paid LLM so the prototype
// runs at zero cost. Calls the stable v1beta `generateContent` REST endpoint
// directly via fetch — no SDK, so it's resilient to SDK churn.
//
// Set GEMINI_API_KEY (free key from https://aistudio.google.com/apikey).
// GEMINI_MODEL is optional; defaults to a free flash model.

// gemini-3.5-flash is the fallback, not primary — it failed 100% of attempts
// (4/4) in testing, consistently with HTTP 503, likely because it's a newer
// model under heavy demand regardless of this account's own quota headroom.
// gemini-2.5-flash was the more reliable of the two in practice.
const DEFAULT_MODEL = "gemini-2.5-flash";
// Each Gemini model has its own independent daily quota on the free tier —
// when the primary model's quota is exhausted, this sibling model (same
// generation, same generateContent API shape) usually still has headroom.
const FALLBACK_MODEL = "gemini-3.5-flash";

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

function modelChain(): string[] {
  const primary = geminiModel();
  return primary === FALLBACK_MODEL ? [primary] : [primary, FALLBACK_MODEL];
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

  // The free tier returns 429/503 ("high demand", or a model's own daily
  // quota exhausted) often enough in practice that a single attempt against
  // a single model regularly fails for reasons that have nothing to do with
  // the request. Retry each model a couple of times, then fall through to
  // the next model in the chain before giving up. In JSON mode, a response
  // that hit the token ceiling mid-structure is just as unusable as an HTTP
  // error — it's a guaranteed parse failure — so it gets the same treatment.
  const ATTEMPTS_PER_MODEL = 2;
  const chain = modelChain();
  let lastDetail = "unknown error";
  let lastUserMessage = "The AI planner couldn't process this request. Please try again.";

  for (const model of chain) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      const res = await fetch(`${endpoint(model)}?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });

      if (!res.ok) {
        const errBody = await res.text();
        const retryable = res.status === 429 || res.status >= 500;
        lastDetail = `HTTP ${res.status} on ${model}: ${errBody.slice(0, 500)}`;
        lastUserMessage = retryable
          ? "Our AI planner is getting heavy traffic right now. Please try again in a moment."
          : "The AI planner couldn't process this request. Please try again.";
        if (!retryable) break; // this model won't recover — try the next one
        if (attempt < ATTEMPTS_PER_MODEL) {
          console.warn(`Gemini ${model} attempt ${attempt}/${ATTEMPTS_PER_MODEL} got HTTP ${res.status}, retrying…`);
          await new Promise((r) => setTimeout(r, attempt * 800));
        } else {
          console.warn(`Gemini ${model} exhausted after ${ATTEMPTS_PER_MODEL} attempts (HTTP ${res.status}).`);
        }
        continue;
      }

      const data = await res.json();
      const cand = data?.candidates?.[0];
      if (!cand) {
        const reason = data?.promptFeedback?.blockReason || "no candidates returned";
        lastDetail = `no candidates on ${model} (${reason})`;
        lastUserMessage = "The AI planner couldn't generate a result for this request. Please try again.";
        break;
      }
      if (cand.finishReason && !["STOP", "MAX_TOKENS"].includes(cand.finishReason)) {
        lastDetail = `finishReason=${cand.finishReason} on ${model}`;
        lastUserMessage = "The AI planner's response was cut off unexpectedly. Please try again.";
        break;
      }

      const text: string = (cand.content?.parts || [])
        .map((p: { text?: string }) => p.text || "")
        .join("");
      if (!text.trim()) {
        lastDetail = `empty text on ${model}`;
        lastUserMessage = "The AI planner returned an empty response. Please try again.";
        break;
      }

      const truncated = json && cand.finishReason === "MAX_TOKENS";
      if (truncated) {
        lastDetail = `truncated at MAX_TOKENS on ${model} (${text.length} chars)`;
        lastUserMessage = "The AI planner's response was too long and got cut off. Please try again.";
        if (attempt < ATTEMPTS_PER_MODEL) {
          console.warn(`Gemini ${model} attempt ${attempt}/${ATTEMPTS_PER_MODEL} hit MAX_TOKENS, retrying…`);
          await new Promise((r) => setTimeout(r, attempt * 800));
          continue;
        }
        console.warn(`Gemini ${model} exhausted after ${ATTEMPTS_PER_MODEL} attempts (MAX_TOKENS).`);
        break;
      }

      return text;
    }
  }

  failGemini(lastDetail, lastUserMessage);
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
  try {
    return JSON.parse(s) as T;
  } catch (e) {
    // Most often a response that hit the token ceiling mid-structure —
    // the raw SyntaxError text is meaningless to a homeowner.
    failGemini(`invalid JSON (${(e as Error).message}): ${s.slice(0, 300)}`, "The AI planner's response didn't come back in the right format. Please try again.");
  }
}
