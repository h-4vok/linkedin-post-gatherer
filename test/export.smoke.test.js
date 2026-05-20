import { describe, expect, it } from "vitest";
import {
  buildResultFilename,
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
        author_network_proximity: "1st",
        post_text: "Hello",
        posted_time: "4h",
        is_repost: false,
        type: "organic",
        extracted_at: "2026-03-23T12:00:00.000Z",
        comment_count: 12,
        comment_count_text: "12 comments",
        reaction_count: 1200,
        reaction_count_text: "1.2K reactions",
      }),
    ]);

    expect(json).toContain('"link": "https://example.com/post/1"');
    expect(json).toContain('"author_network_proximity": "1st"');
    expect(json).toContain('"is_repost": false');
    expect(json).toContain('"comment_count": 12');
    expect(json).toContain('"reaction_count_text": "1.2K reactions"');
  });

  it("keeps enriched export fields in the preview payload", () => {
    const json = serializeExportItems([
      toEnrichedExportItem({
        author: "Ada Lovelace",
        author_network_proximity: "Following",
        author_role: "Engineer",
        author_followers: 1200,
        author_weight: "high",
        comment_count: 3,
        comment_count_text: "3 comments",
        reaction_count: null,
        reaction_count_text: null,
      }),
    ]);

    expect(json).toContain('"author_role": "Engineer"');
    expect(json).toContain('"author_network_proximity": "Following"');
    expect(json).toContain('"author_followers": 1200');
    expect(json).toContain('"author_weight": "high"');
    expect(json).toContain('"comment_count": 3');
    expect(json).toContain('"reaction_count": null');
  });

  it("serializes legacy engagement fields as null", () => {
    expect(toRawExportItem({ author: "Ada Lovelace" })).toMatchObject({
      author_network_proximity: null,
      comment_count: null,
      comment_count_text: null,
      reaction_count: null,
      reaction_count_text: null,
    });
  });

  it("defaults enriched author_weight to trivial when signals are missing", () => {
    const json = serializeExportItems([
      toEnrichedExportItem({
        author: "Ada Lovelace",
        author_role: null,
        author_followers: null,
      }),
    ]);

    expect(json).toContain('"author_weight": "trivial"');
  });

  it("builds result filenames with local datetime precision", () => {
    expect(buildResultFilename(new Date(2026, 3, 5, 9, 7, 3))).toBe(
      "linkedin_crawl_result_20260405-090703.json"
    );
  });
});
