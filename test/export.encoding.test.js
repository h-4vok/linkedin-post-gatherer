import { describe, expect, it } from "vitest";
import { serializeExportItems } from "../src/shared/export.js";

const EXPECTED_UNICODE_POST_TEXT =
  "\u201CHola\u201D \u2014 lanzamiento \u{1F680}\n\nL\u00ednea con emoji \u{1F600}\nSegunda l\u00ednea unida\n\nBloque final con acento: p\u00e1rrafo";

describe("Export encoding", () => {
  it("preserves unicode and paragraph breaks during serialization", () => {
    const items = [
      {
        post_text: EXPECTED_UNICODE_POST_TEXT,
        author: "Ada Lovelace",
      },
    ];

    const json = serializeExportItems(items);

    expect(JSON.parse(json)[0].post_text).toBe(EXPECTED_UNICODE_POST_TEXT);
    expect(json).toContain("\\n\\n");
  });

  it("keeps the current data-url export round trip intact", () => {
    const items = [
      {
        post_text: EXPECTED_UNICODE_POST_TEXT,
        author: "Ada Lovelace",
      },
    ];

    const json = serializeExportItems(items);
    const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    const decodedJson = decodeURIComponent(dataUrl.split(",")[1]);
    const parsed = JSON.parse(decodedJson);

    expect(decodedJson).toBe(json);
    expect(parsed[0].post_text).toBe(EXPECTED_UNICODE_POST_TEXT);
    expect(decodedJson).not.toContain("Ã");
    expect(decodedJson).not.toContain("â€");
  });
});
