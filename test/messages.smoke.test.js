import { describe, expect, it } from "vitest";
import { COPY_TEXT } from "../src/shared/messages.js";

describe("shared activity copy", () => {
  it("formats ai chunk result copy with the real interested count", () => {
    expect(COPY_TEXT.activity.chunkResult(0)).toBe('AI Validation found: 0 posts as "interested".');
    expect(COPY_TEXT.activity.chunkResult(7)).toBe('AI Validation found: 7 posts as "interested".');
  });
});
