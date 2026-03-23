import { describe, expect, it } from "vitest";
import {
  serializeExportItems,
  toEnrichedExportItem,
  toRawExportItem,
} from "../src/shared/export.js";

describe("export helpers", () => {
  it("serializes raw export items as pretty JSON", () => {
    const json = serializeExportItems([
      toRawExportItem({
        link: "https://example.com/post/1",
        author: "Ada Lovelace",
        post_text: "Hello",
        posted_time: "4h",
        is_repost: false,
        type: "organic",
        extracted_at: "2026-03-23T12:00:00.000Z",
      }),
    ]);

    expect(json).toContain('"link": "https://example.com/post/1"');
    expect(json).toContain('"is_repost": false');
  });

  it("keeps enriched export fields in the preview payload", () => {
    const json = serializeExportItems([
      toEnrichedExportItem({
        author: "Ada Lovelace",
        author_role: "Engineer",
        author_followers: 1200,
        author_weight: "high",
      }),
    ]);

    expect(json).toContain('"author_role": "Engineer"');
    expect(json).toContain('"author_followers": 1200');
    expect(json).toContain('"author_weight": "high"');
  });
});
