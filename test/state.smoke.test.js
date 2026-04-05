import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendIgnoredSamples,
  getAiValidationEligibleItems,
  getLatestResultItems,
  getSerializableState,
  hydrateStateFromStorage,
  resetAiValidationStatuses,
  resetDebugState,
  setAiQueueState,
  startEnrichment,
  syncEnrichedItems,
  updateInterestValidationBatch,
} from "../src/shared/state.js";

function mockChromeStorage() {
  globalThis.chrome = {
    storage: {
      session: {
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
}

describe("tab state debug samples", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.chrome;
  });

  it("keeps the most recent ignored samples and caps the buffer", async () => {
    mockChromeStorage();

    await resetDebugState(41);
    await appendIgnoredSamples(
      41,
      Array.from({ length: 51 }, (_, index) => ({
        reason: `reason-${index + 1}`,
        text_preview: `sample-${index + 1}`,
        html_preview: `<div>${index + 1}</div>`,
        captured_at: `2026-03-23T12:${String(index).padStart(2, "0")}:00.000Z`,
      }))
    );

    const state = getSerializableState(41);

    expect(state.ignoredSamples).toHaveLength(50);
    expect(state.ignoredSamples[0].reason).toBe("reason-51");
    expect(state.ignoredSamples[49].reason).toBe("reason-2");
  });

  it("targets only pending and unknown posts for queue processing", async () => {
    mockChromeStorage();

    await resetDebugState(52);
    await updateInterestValidationBatch(52, [
      {
        fingerprint: "missing",
        validationPatch: { status: "interested" },
      },
    ]);

    globalThis.chrome.storage.session.get.mockResolvedValue({
      "collector.tab.52": {
        items: [
          {
            fingerprint: "fp-pending",
            author: "Ada",
            extracted_at: "2026-03-30T10:00:00.000Z",
            interest_validation: {
              status: "pending",
              attempts: 0,
              validated_at: null,
              error: null,
              source: "gemini",
            },
          },
          {
            fingerprint: "fp-unknown",
            author: "Grace",
            extracted_at: "2026-03-30T10:01:00.000Z",
            interest_validation: {
              status: "unknown",
              attempts: 2,
              validated_at: "2026-03-30T10:02:00.000Z",
              error: "rate-limited",
              source: "gemini",
            },
          },
          {
            fingerprint: "fp-done",
            author: "Linus",
            extracted_at: "2026-03-30T10:03:00.000Z",
            interest_validation: {
              status: "interested",
              attempts: 1,
              validated_at: "2026-03-30T10:04:00.000Z",
              error: null,
              source: "gemini",
            },
          },
        ],
      },
    });

    await hydrateStateFromStorage(52);

    const eligible = getAiValidationEligibleItems(52);
    expect(eligible.map((item) => item.fingerprint)).toEqual(["fp-pending", "fp-unknown"]);
  });

  it("resets AI validation to pending for all posts on rerun", async () => {
    mockChromeStorage();

    globalThis.chrome.storage.session.get.mockResolvedValue({
      "collector.tab.54": {
        items: [
          {
            fingerprint: "fp-interested",
            author: "Ada",
            extracted_at: "2026-03-30T10:00:00.000Z",
            interest_validation: {
              status: "interested",
              attempts: 1,
              validated_at: "2026-03-30T10:05:00.000Z",
              error: null,
              source: "gemini",
            },
          },
          {
            fingerprint: "fp-not",
            author: "Grace",
            extracted_at: "2026-03-30T10:01:00.000Z",
            interest_validation: {
              status: "not_interested",
              attempts: 1,
              validated_at: "2026-03-30T10:05:00.000Z",
              error: null,
              source: "gemini",
            },
          },
        ],
      },
    });

    await hydrateStateFromStorage(54);
    await resetAiValidationStatuses(54);

    const state = getSerializableState(54);
    expect(state.aiCounts).toEqual({
      pending: 2,
      interested: 0,
      not_interested: 0,
      unknown: 0,
    });
    expect(getAiValidationEligibleItems(54).map((item) => item.fingerprint)).toEqual([
      "fp-interested",
      "fp-not",
    ]);
  });

  it("persists bulk AI queue progress and batch validation patches", async () => {
    mockChromeStorage();

    globalThis.chrome.storage.session.get.mockResolvedValue({
      "collector.tab.53": {
        items: [
          {
            fingerprint: "fp-1",
            author: "Ada",
            extracted_at: "2026-03-30T10:00:00.000Z",
            interest_validation: {
              status: "pending",
              attempts: 0,
              validated_at: null,
              error: null,
              source: "gemini",
            },
          },
          {
            fingerprint: "fp-2",
            author: "Grace",
            extracted_at: "2026-03-30T10:01:00.000Z",
            interest_validation: {
              status: "unknown",
              attempts: 1,
              validated_at: "2026-03-30T10:02:00.000Z",
              error: "rate-limited",
              source: "gemini",
            },
          },
        ],
      },
    });
    await hydrateStateFromStorage(53);

    await setAiQueueState(53, {
      phase: "running",
      totalPosts: 2,
      processedPosts: 1,
      totalChunks: 1,
      completedChunks: 0,
      currentChunkIndex: 1,
      lastMessage: "Chunk 1/1 running.",
    });
    await updateInterestValidationBatch(53, [
      {
        fingerprint: "fp-1",
        validationPatch: {
          status: "interested",
          attempts: 1,
          validated_at: "2026-03-30T10:05:00.000Z",
          error: null,
          source: "gemini",
        },
      },
      {
        fingerprint: "fp-2",
        validationPatch: {
          status: "not_interested",
          attempts: 2,
          validated_at: "2026-03-30T10:05:00.000Z",
          error: null,
          source: "gemini",
        },
      },
    ]);

    const state = getSerializableState(53);
    expect(state.aiQueue).toMatchObject({
      phase: "running",
      totalPosts: 2,
      processedPosts: 1,
      totalChunks: 1,
      currentChunkIndex: 1,
    });
    expect(state.aiCounts).toEqual({
      pending: 0,
      interested: 1,
      not_interested: 1,
      unknown: 0,
    });
  });

  it("composes the latest enriched snapshot with AI validation from raw state", async () => {
    mockChromeStorage();

    globalThis.chrome.storage.session.get.mockResolvedValue({
      "collector.tab.55": {
        items: [
          {
            fingerprint: "fp-1",
            author: "Ada",
            extracted_at: "2026-03-30T10:00:00.000Z",
            author_profile_url: "https://www.linkedin.com/in/ada/",
            interest_validation: {
              status: "interested",
              attempts: 1,
              validated_at: "2026-03-30T10:05:00.000Z",
              error: null,
              source: "gemini",
            },
          },
        ],
      },
    });

    await hydrateStateFromStorage(55);
    await startEnrichment(55, {
      totalPosts: 1,
      totalAuthors: 1,
      lastMessage: "Starting author enrichment.",
    });
    await syncEnrichedItems(
      55,
      [
        {
          fingerprint: "fp-1",
          author: "Ada",
          extracted_at: "2026-03-30T10:00:00.000Z",
          author_profile_url: "https://www.linkedin.com/in/ada/",
          author_role: "Engineer",
          author_followers: 1200,
          author_weight: "low",
        },
      ],
      {
        processedPosts: 1,
        processedAuthors: 1,
        currentAuthor: "Ada",
        currentPostIndex: 1,
        lastMessage: "Cache hit for Ada.",
      }
    );

    const latest = getLatestResultItems(55);

    expect(latest.mode).toBe("enriched");
    expect(latest.items).toHaveLength(1);
    expect(latest.items[0]).toMatchObject({
      author_role: "Engineer",
      author_followers: 1200,
      author_weight: "low",
    });
    expect(latest.items[0].interest_validation).toMatchObject({
      status: "interested",
    });
  });
});
