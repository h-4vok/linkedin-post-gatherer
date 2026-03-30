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
