export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmClientConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
};

export class LlmRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LlmRequestError";
  }
}

/**
 * Minimal OpenAI-compatible chat-completions client. Argus only needs structured
 * JSON answers for triage and review, so this stays dependency-free and injectable.
 */
export async function completeJson<T>(input: {
  config: LlmClientConfig;
  messages: LlmMessage[];
  timeoutMs?: number;
}): Promise<T> {
  const fetchImpl = input.config.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 120_000);

  let response: Response;
  try {
    response = await fetchImpl(`${input.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.config.apiKey}`,
      },
      body: JSON.stringify({
        model: input.config.model,
        messages: input.messages,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new LlmRequestError(`LLM request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new LlmRequestError(`LLM request returned ${response.status}: ${body.slice(0, 500)}`, response.status);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new LlmRequestError("LLM response had no message content");

  return parseJsonContent<T>(content);
}

export function parseJsonContent<T>(content: string): T {
  const trimmed = content.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")
    : trimmed;
  try {
    return JSON.parse(unfenced) as T;
  } catch {
    throw new LlmRequestError(`LLM response was not valid JSON: ${unfenced.slice(0, 200)}`);
  }
}
