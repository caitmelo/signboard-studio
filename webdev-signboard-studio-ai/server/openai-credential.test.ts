import { describe, expect, it } from "vitest";

describe("OpenAI project credential", () => {
  it("authenticates against the models endpoint", async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    expect(apiKey, "OPENAI_API_KEY must be configured in the project").toBeTruthy();

    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });

    expect(response.status, `OpenAI authentication failed with HTTP ${response.status}`).toBe(200);
    const body = (await response.json()) as { data?: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  }, 20_000);
});
