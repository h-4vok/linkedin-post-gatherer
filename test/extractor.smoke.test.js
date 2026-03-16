import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  extractAuthor,
  findFeedContainer,
  findPostElements,
  isPromotedPost,
  scanFeedPosts,
} from "../src/shared/extractor.js";
import { mergeNewItems } from "../src/shared/state.js";

const FEED_FIXTURE = `
  <div componentkey="container-update-list_mainFeed-lazy-container">
    <div role="listitem" data-post-id="organic-1">
      <div>
        <p>Regular organic post</p>
        <span aria-hidden="true">
          Gonzalo Corbijn
          <span class="verified"></span>
          <span class="relationship"><span> • 1st</span></span>
        </span>
      </div>
    </div>
    <div role="listitem" data-post-id="promoted-1">
      <div>
        <p>Promoted by Acme</p>
        <span aria-hidden="true">
          Should Be Ignored
          <span class="relationship"><span> • 2nd</span></span>
        </span>
      </div>
    </div>
    <div role="listitem" data-post-id="organic-2">
      <div>
        <p>Another organic post</p>
        <span aria-hidden="true">
          Ada Lovelace
          <span class="relationship"><span> • 3rd+</span></span>
        </span>
      </div>
    </div>
    <div role="listitem" data-post-id="missing-author">
      <div>
        <p>Organic but malformed</p>
        <span aria-hidden="true">No relationship marker here</span>
      </div>
    </div>
    <div role="listitem" data-post-id="organic-following">
      <div>
        <p>Organic following post</p>
        <span aria-hidden="true">
          Kelsey Hightower Verified Profile Following
        </span>
      </div>
    </div>
  </div>
`;

function setupDocument() {
  return new JSDOM(FEED_FIXTURE).window.document;
}

describe("LinkedIn feed smoke extraction", () => {
  it("finds the feed container and list items", () => {
    const document = setupDocument();
    const container = findFeedContainer(document);

    expect(container).not.toBeNull();
    expect(findPostElements(container)).toHaveLength(5);
  });

  it("filters promoted content", () => {
    const document = setupDocument();
    const posts = findPostElements(findFeedContainer(document));

    expect(isPromotedPost(posts[1])).toBe(true);
    expect(isPromotedPost(posts[0])).toBe(false);
  });

  it("extracts the author from relationship markers", () => {
    const document = setupDocument();
    const posts = findPostElements(findFeedContainer(document));

    expect(extractAuthor(posts[0])).toBe("Gonzalo Corbijn");
    expect(extractAuthor(posts[2])).toBe("Ada Lovelace");
    expect(extractAuthor(posts[4])).toBe("Kelsey Hightower");
  });

  it("scans only new elements in repeated rescans", () => {
    const document = setupDocument();
    const container = findFeedContainer(document);
    const processedElements = new WeakSet();

    const firstPass = scanFeedPosts(container, {
      processedElements,
      nowFactory: () => new Date("2026-03-16T20:00:00.000Z"),
    });
    const secondPass = scanFeedPosts(container, { processedElements });

    expect(firstPass.acceptedItems).toHaveLength(3);
    expect(firstPass.skippedItems).toContain("promoted");
    expect(firstPass.skippedItems).toContain("missing-author");
    expect(secondPass.acceptedItems).toHaveLength(0);
  });

  it("deduplicates accepted items by fingerprint in shared state", () => {
    const document = setupDocument();
    const container = findFeedContainer(document);
    const { acceptedItems } = scanFeedPosts(container, {
      processedElements: new WeakSet(),
      nowFactory: () => new Date("2026-03-16T20:00:00.000Z"),
    });

    const firstMerge = mergeNewItems(acceptedItems);
    const secondMerge = mergeNewItems(acceptedItems);

    expect(firstMerge.addedCount).toBe(3);
    expect(secondMerge.addedCount).toBe(0);
  });
});
