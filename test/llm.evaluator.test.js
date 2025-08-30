import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import LLMEvaluator from "../server/services/LLMEvaluator.js";

describe("LLMEvaluator", () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it("parses OpenAI choices[].message.content JSON (happy path)", async () => {
    vi.stubGlobal("fetch", async (_url, _opts) => {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              { message: { content: '{"score":80,"feedback":"bien"}' } },
            ],
          }),
      };
    });
    const ev = new LLMEvaluator({
      openaiKey: "k",
      openaiUrl: "https://api.openai.com",
      openaiModel: "m",
    });
    const res = await ev.evaluate({ title: "Q" }, "respuesta");
    expect(res.score).toBeCloseTo(0.8);
    expect(res.feedback).toBe("bien");
  });

  it("falls back to Ollama when OpenAI fails", async () => {
    vi.stubGlobal("fetch", async (_url, _opts) => {
      const url = String(_url);
      if (url.includes("/v1/chat/completions")) {
        return { ok: false, status: 500, text: async () => "error" };
      }
      // Ollama response shape: results[0].content with JSON
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            results: [{ content: '{"score":50,"feedback":"okollama"}' }],
          }),
      };
    });
    const ev = new LLMEvaluator({
      openaiKey: "k",
      openaiUrl: "https://api.openai.com",
      openaiModel: "m",
      ollamaUrl: "http://ollama.local",
      ollamaModel: "ll",
    });
    const res = await ev.evaluate({ title: "Q" }, "respuesta");
    expect(res.score).toBeCloseTo(0.5);
    expect(res.feedback).toBe("okollama");
  });

  it("returns neutral when responses are not parseable", async () => {
    vi.stubGlobal("fetch", async (_url, _opts) => ({
      ok: true,
      status: 200,
      text: async () => "no json here",
    }));
    const ev = new LLMEvaluator({
      openaiKey: "k",
      openaiUrl: "https://api.openai.com",
      openaiModel: "m",
      ollamaUrl: "http://ollama.local",
      ollamaModel: "ll",
    });
    const res = await ev.evaluate({ title: "Q" }, "respuesta");
    expect(res.score).toBe(0);
    expect(typeof res.feedback).toBe("string");
  });
});
