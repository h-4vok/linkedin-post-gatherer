import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendIgnoredSamples,
  getSerializableState,
  resetDebugState,
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
});
