import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildValidationResult,
  getAiConfigError,
  getRetryDelayMs,
  normalizeAiConfig,
  shouldRetryGeminiError,
  validatePostsInterestBulk,
  validatePostInterest,
} from "../src/background/gemini.js";
import { DEFAULT_GEMINI_SYSTEM_INSTRUCTION } from "../src/background/default-system-instruction.js";
import { AI_RATE_LIMIT, AI_STATUS } from "../src/shared/constants.js";

describe("gemini validation helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes persisted config and validates required fields", () => {
    const config = normalizeAiConfig({
      enabled: true,
      apiKey: " test-key ",
      model: " gemini-2.5-flash ",
      systemInstruction: " decide relevance ",
    });

    expect(config).toEqual({
      enabled: true,
      apiKey: "test-key",
      model: "gemini-2.5-flash",
      systemInstruction: "decide relevance",
    });
    expect(getAiConfigError(config)).toBeNull();
    expect(getAiConfigError({ ...config, apiKey: "" })).toBe("Gemini API key is missing.");
  });

  it("falls back to the default system instruction when none is provided", () => {
    const config = normalizeAiConfig({
      enabled: true,
      apiKey: "test-key",
      model: "gemini-2.5-flash",
      systemInstruction: "",
    });

    expect(config.systemInstruction).toBe(DEFAULT_GEMINI_SYSTEM_INSTRUCTION);
    expect(getAiConfigError(config)).toBeNull();
  });

  it("uses the new default system instruction for empty config", () => {
    expect(normalizeAiConfig().systemInstruction).toBe(DEFAULT_GEMINI_SYSTEM_INSTRUCTION);
  });

  it("keeps explicit anti-sales and anti-PR criteria in the default prompt", () => {
    const prompt = DEFAULT_GEMINI_SYSTEM_INSTRUCTION.toLowerCase();

    expect(prompt).toContain("vender");
    expect(prompt).toContain("pr comercial");
    expect(prompt).toContain("demo");
    expect(prompt).toContain("lead-gen");
    expect(prompt).toContain("oferta");
    expect(prompt).toContain("lanzamiento");
    expect(prompt).toContain("cta");
    expect(prompt).toContain("podcasts");
    expect(prompt).toContain("summits");
    expect(prompt).toContain("listen to the full episode");
    expect(prompt).toContain("register here");
    expect(prompt).toContain("download the report");
  });

  it("preserves custom system instructions instead of overwriting them", () => {
    const customInstruction = `${DEFAULT_GEMINI_SYSTEM_INSTRUCTION}\n\nCustom scoring note.`;
    const config = normalizeAiConfig({
      systemInstruction: customInstruction,
    });

    expect(config.systemInstruction).toBe(customInstruction);
  });

  it("parses an interested decision from Gemini", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "interested" }],
            },
          },
        ],
      }),
    });

    const result = await validatePostInterest(
      {
        author: "Ada Lovelace",
        reposted_by: null,
        posted_time: "4h",
        type: "organic",
        post_text: "Strong leadership post",
      },
      {
        enabled: true,
        apiKey: "abc",
        model: "gemini-2.5-flash",
        systemInstruction: "Return only interested or not_interested.",
      },
      { fetchImpl }
    );

    expect(result.status).toBe(AI_STATUS.interested);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects ambiguous model output as a parse error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "maybe" }],
            },
          },
        ],
      }),
    });

    await expect(
      validatePostInterest(
        {
          author: "Grace Hopper",
          reposted_by: null,
          posted_time: null,
          type: "organic",
          post_text: "Compiler reflections",
        },
        {
          enabled: true,
          apiKey: "abc",
          model: "gemini-2.5-flash",
          systemInstruction: "Return only interested or not_interested.",
        },
        { fetchImpl }
      )
    ).rejects.toMatchObject({
      kind: "parse-error",
    });
  });

  it("calculates conservative retry delays for free-tier quota handling", () => {
    expect(shouldRetryGeminiError({ kind: "rate-limited" }, AI_RATE_LIMIT.maxAttempts)).toBe(false);
    expect(getRetryDelayMs({ kind: "rate-limited", retryAfterMs: 8000 }, 2)).toBe(13000);
    expect(getRetryDelayMs({ kind: "quota-exhausted" }, 1)).toBe(AI_RATE_LIMIT.quotaCooldownMs);
    expect(buildValidationResult(AI_STATUS.unknown, 3, "rate-limited")).toMatchObject({
      status: AI_STATUS.unknown,
      attempts: 3,
      error: "rate-limited",
    });
  });

  it("builds unresolved validation metadata with retry hints", () => {
    expect(
      buildValidationResult(AI_STATUS.unresolved, 3, "server-error", {
        retryAfterMs: 45000,
        retryAfterUntil: "2026-05-01T10:00:45.000Z",
      })
    ).toMatchObject({
      status: AI_STATUS.unresolved,
      attempts: 3,
      error: "server-error",
      retry_after_ms: 45000,
      retry_after_until: "2026-05-01T10:00:45.000Z",
    });
  });

  it("parses bulk interested ids and ignores duplicates or unknown ids", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    interested_ids: ["fp-1", "fp-1", "fp-missing", "fp-3"],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });

    const result = await validatePostsInterestBulk(
      [
        {
          fingerprint: "fp-1",
          author: "Ada",
          reposted_by: null,
          posted_time: "4h",
          type: "organic",
          post_text: "Post 1",
        },
        {
          fingerprint: "fp-2",
          author: "Grace",
          reposted_by: null,
          posted_time: "5h",
          type: "organic",
          post_text: "Post 2",
        },
        {
          fingerprint: "fp-3",
          author: "Linus",
          reposted_by: null,
          posted_time: "6h",
          type: "organic",
          post_text: "Post 3",
        },
      ],
      {
        enabled: true,
        apiKey: "abc",
        model: "gemini-2.5-flash",
        systemInstruction: "Return valid JSON with interested_ids.",
      },
      { fetchImpl }
    );

    expect(result.interestedIds).toEqual(["fp-1", "fp-3"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const requestBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userText = requestBody.contents[0].parts[0].text;

    expect(requestBody.generationConfig.responseMimeType).toBe("application/json");
    expect(userText).toContain('Return valid JSON only in this exact shape: {"interested_ids"');
    expect(userText).toContain("Do not include explanations, markdown, or extra keys.");
  });

  it("rejects invalid bulk payloads as parse errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: '{"wrong_key":["fp-1"]}' }],
            },
          },
        ],
      }),
    });

    await expect(
      validatePostsInterestBulk(
        [
          {
            fingerprint: "fp-1",
            author: "Ada",
            reposted_by: null,
            posted_time: "4h",
            type: "organic",
            post_text: "Post 1",
          },
        ],
        {
          enabled: true,
          apiKey: "abc",
          model: "gemini-2.5-flash",
          systemInstruction: "Return valid JSON with interested_ids.",
        },
        { fetchImpl }
      )
    ).rejects.toMatchObject({
      kind: "parse-error",
    });
  });
});
