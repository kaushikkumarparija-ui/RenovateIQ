// Unified LLM client over OpenAI-compatible providers. RenovateIQ runs on two
// free providers — OpenRouter (free `:free` models) as primary, Groq (very
// fast) as fallback — so plan generation keeps working when one is rate-
// limited or down. Both speak the OpenAI `chat/completions` shape, so a single
// code path drives both; we just swap base URL, key, model and headers.
//
// Configure at least one of:
//   GROQ_API_KEY        (https://console.groq.com/keys)
//   OPENROUTER_API_KEY  (https://openrouter.ai/keys)
// Optional model overrides: GROQ_MODEL, OPENROUTER_MODEL.
//
// Called directly via fetch (no SDK) so it's resilient to SDK churn.

const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";
const OPENROUTER_DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

interface Provider {
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
  /**
   * Hard cap on requested output tokens for this provider, regardless of what
   * the caller asked for. Groq's free tier enforces a per-request tokens-per-
   * minute budget (prompt + completion combined) — e.g. 12,000 TPM for
   * llama-3.3-70b-versatile — and a large system prompt (the plan knowledge
   * base) plus a high max_tokens request blows through it with an HTTP 413
   * on *every* call, not just under load. Capping keeps Groq usable as a
   * fallback without silently truncating output on providers that can afford more.
   */
  maxRequestTokens?: number;
}

// Build the provider chain from whatever keys are present. OpenRouter leads;
// Groq is the fall-through when OpenRouter is rate-limited or down. Missing
// keys are simply skipped, so the app runs on either one alone or both together.
function providers(): Provider[] {
  const chain: Provider[] = [];

  if (process.env.OPENROUTER_API_KEY) {
    chain.push({
      label: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL,
      // OpenRouter uses these for attribution/rankings; both are optional.
      extraHeaders: {
        "HTTP-Referer":
          process.env.OPENROUTER_SITE_URL || "https://renovateiq-bice.vercel.app",
        "X-Title": "RenovateIQ",
      },
    });
  }

  if (process.env.GROQ_API_KEY) {
    chain.push({
      label: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL,
      // Leaves headroom under the 12,000 TPM free-tier budget after the
      // system+user prompt (observed ~2.8k tokens for the plan prompt).
      maxRequestTokens: 8000,
    });
  }

  return chain;
}

/** True when at least one provider key is configured on the server. */
export function llmConfigured(): boolean {
  return providers().length > 0;
}

/** Human-readable summary of the active chain, e.g. "Groq:llama-3.3-70b-versatile → OpenRouter:…". */
export function llmProviderSummary(): string {
  const chain = providers();
  return chain.length ? chain.map((p) => `${p.label}:${p.model}`).join(" → ") : "none";
}

interface LlmOpts {
  system: string;
  user: string;
  /** When true, ask for a strict JSON object back (OpenAI `response_format`). */
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
}

// Logs the technical detail server-side, but throws a message that's safe to
// show a homeowner directly — callers just surface (e as Error).message as-is.
function failLlm(detail: string, userMessage: string): never {
  console.error(`LLM call failed: ${detail}`);
  throw new Error(userMessage);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function llmGenerate({
  system,
  user,
  json = false,
  maxOutputTokens = 8192,
  temperature = 0.4,
}: LlmOpts): Promise<string> {
  const chain = providers();
  if (!chain.length) {
    throw new Error(
      "No LLM provider is configured on the server. Set GROQ_API_KEY and/or OPENROUTER_API_KEY.",
    );
  }

  const ATTEMPTS_PER_PROVIDER = 2;
  let lastDetail = "unknown error";
  let lastUserMessage = "The AI planner couldn't process this request. Please try again.";

  // Free tiers return 429 ("rate limited") and 5xx often enough that a single
  // attempt regularly fails for reasons unrelated to the request. Retry each
  // provider a couple of times, then fall through to the next before giving up.
  // In JSON mode, a response cut off at the token ceiling is just as unusable
  // as an HTTP error (guaranteed parse failure), so it gets the same treatment.
  for (const prov of chain) {
    const providerMaxTokens = prov.maxRequestTokens
      ? Math.min(maxOutputTokens, prov.maxRequestTokens)
      : maxOutputTokens;
    const payload = JSON.stringify({
      model: prov.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      max_tokens: providerMaxTokens,
      // Both Groq and OpenRouter accept this; models that don't support strict
      // JSON simply best-effort it, and parseLlmJson() tolerates stray fences.
      ...(json ? { response_format: { type: "json_object" } } : {}),
    });

    for (let attempt = 1; attempt <= ATTEMPTS_PER_PROVIDER; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${prov.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${prov.apiKey}`,
            ...(prov.extraHeaders || {}),
          },
          body: payload,
        });
      } catch (e) {
        lastDetail = `network error on ${prov.label}: ${(e as Error).message}`;
        lastUserMessage =
          "Our AI planner is getting heavy traffic right now. Please try again in a moment.";
        if (attempt < ATTEMPTS_PER_PROVIDER) {
          await sleep(attempt * 800);
          continue;
        }
        break;
      }

      if (!res.ok) {
        const errBody = await res.text();
        const retryable = res.status === 429 || res.status >= 500;
        lastDetail = `HTTP ${res.status} on ${prov.label} (${prov.model}): ${errBody.slice(0, 500)}`;
        lastUserMessage = retryable
          ? "Our AI planner is getting heavy traffic right now. Please try again in a moment."
          : "The AI planner couldn't process this request. Please try again.";
        if (!retryable) break; // auth / bad model / bad request — try the next provider
        if (attempt < ATTEMPTS_PER_PROVIDER) {
          console.warn(`${prov.label} attempt ${attempt}/${ATTEMPTS_PER_PROVIDER} got HTTP ${res.status}, retrying…`);
          await sleep(attempt * 800);
        } else {
          console.warn(`${prov.label} exhausted after ${ATTEMPTS_PER_PROVIDER} attempts (HTTP ${res.status}).`);
        }
        continue;
      }

      const data = await res.json();
      const choice = data?.choices?.[0];
      if (!choice) {
        lastDetail = `no choices on ${prov.label}: ${JSON.stringify(data)?.slice(0, 300)}`;
        lastUserMessage = "The AI planner couldn't generate a result for this request. Please try again.";
        break;
      }

      const text: string = choice.message?.content ?? "";
      if (!text.trim()) {
        lastDetail = `empty text on ${prov.label} (finish_reason=${choice.finish_reason})`;
        lastUserMessage = "The AI planner returned an empty response. Please try again.";
        break;
      }

      const truncated = json && choice.finish_reason === "length";
      if (truncated) {
        lastDetail = `truncated at token ceiling on ${prov.label} (${text.length} chars)`;
        lastUserMessage = "The AI planner's response was too long and got cut off. Please try again.";
        if (attempt < ATTEMPTS_PER_PROVIDER) {
          console.warn(`${prov.label} attempt ${attempt}/${ATTEMPTS_PER_PROVIDER} hit the token ceiling, retrying…`);
          await sleep(attempt * 800);
          continue;
        }
        console.warn(`${prov.label} exhausted after ${ATTEMPTS_PER_PROVIDER} attempts (token ceiling).`);
        break;
      }

      return text;
    }
  }

  failLlm(lastDetail, lastUserMessage);
}

/** Parse LLM JSON output, tolerating accidental ```json fences. */
export function parseLlmJson<T>(raw: string): T {
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
    failLlm(
      `invalid JSON (${(e as Error).message}): ${s.slice(0, 300)}`,
      "The AI planner's response didn't come back in the right format. Please try again.",
    );
  }
}
