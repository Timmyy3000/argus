import { describe, expect, test } from "bun:test";
import { completeJson, parseJsonContent, LlmRequestError } from "../src/llm/client";

describe("parseJsonContent", () => {
  test("parses plain JSON", () => {
    expect(parseJsonContent<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });

  test("strips markdown code fences", () => {
    expect(parseJsonContent<{ a: number }>('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  test("throws LlmRequestError on garbage", () => {
    expect(() => parseJsonContent("not json")).toThrow(LlmRequestError);
  });
});

describe("completeJson", () => {
  test("sends an OpenAI-compatible request and returns parsed JSON", async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"verdict": "ok"}' } }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await completeJson<{ verdict: string }>({
      config: { apiKey: "sk-test", baseUrl: "https://llm.example/v1/", model: "test-model", fetchImpl },
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.verdict).toBe("ok");
    expect(captured?.url).toBe("https://llm.example/v1/chat/completions");
    expect(captured?.body.model).toBe("test-model");
    expect(captured?.body.response_format).toEqual({ type: "json_object" });
  });

  test("throws on non-2xx responses", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(
      completeJson({
        config: { apiKey: "sk-test", baseUrl: "https://llm.example", model: "m", fetchImpl },
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow(LlmRequestError);
  });
});
