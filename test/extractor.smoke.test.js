import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  extractAuthor,
  extractPostText,
  extractRepostMetadata,
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
          <span class="relationship"><span> â€¢ 1st</span></span>
        </span>
        <span data-testid="expandable-text-box">
          Full organic text with a hidden ending.
          <button type="button">... more</button>
        </span>
      </div>
    </div>
    <div role="listitem" data-post-id="promoted-1">
      <div>
        <p>Promoted by Acme</p>
        <span aria-hidden="true">
          Should Be Ignored
          <span class="relationship"><span> â€¢ 2nd</span></span>
        </span>
      </div>
    </div>
    <div role="listitem" data-post-id="organic-2">
      <div>
        <p>Another organic post</p>
        <span aria-hidden="true">
          Ada Lovelace
          <span class="relationship"><span> â€¢ 3rd+</span></span>
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
    <div role="listitem" data-post-id="repost-post">
      <div>
        <p>Charity Majors reposted this</p>
      </div>
      <div>
        <span aria-hidden="true">
          Liz Fong-Jones
          <span class="relationship"><span> â€¢ 3rd+</span></span>
        </span>
      </div>
    </div>
    <div role="listitem" data-post-id="support-post">
      <div>
        <p>Gabriel Millien supports this</p>
      </div>
      <div>
        <span aria-hidden="true">
          Cruz Gamboa Premium Profile 3rd+
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
    expect(findPostElements(container)).toHaveLength(7);
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
    expect(extractAuthor(posts[6])).toBe("Cruz Gamboa");
  });

  it("detects repost metadata without misclassifying social suggestions", () => {
    const document = setupDocument();
    const posts = findPostElements(findFeedContainer(document));

    expect(extractRepostMetadata(posts[5])).toEqual({
      is_repost: true,
      reposted_by: "Charity Majors",
    });
    expect(extractRepostMetadata(posts[6])).toEqual({
      is_repost: false,
      reposted_by: null,
    });
  });

  it("extracts post text from the preloaded expandable text box", () => {
    const document = setupDocument();
    const posts = findPostElements(findFeedContainer(document));

    expect(extractPostText(posts[0])).toBe(
      "Full organic text with a hidden ending.",
    );
    expect(extractPostText(posts[2])).toBeNull();
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

    expect(firstPass.acceptedItems).toHaveLength(5);
    expect(firstPass.skippedItems).toContain("promoted");
    expect(firstPass.skippedItems).toContain("missing-author");
    expect(firstPass.acceptedItems[0]).toMatchObject({
      author: "Gonzalo Corbijn",
      post_text: "Full organic text with a hidden ending.",
    });
    expect(firstPass.acceptedItems[3]).toMatchObject({
      author: "Liz Fong-Jones",
      is_repost: true,
      reposted_by: "Charity Majors",
    });
    expect(firstPass.acceptedItems[4]).toMatchObject({
      author: "Cruz Gamboa",
      is_repost: false,
      reposted_by: null,
    });
    expect(secondPass.acceptedItems).toHaveLength(0);
  });

  it("deduplicates accepted items by fingerprint in shared state", () => {
    const document = setupDocument();
    const container = findFeedContainer(document);
    const { acceptedItems } = scanFeedPosts(container, {
      processedElements: new WeakSet(),
      nowFactory: () => new Date("2026-03-16T20:00:00.000Z"),
    });

    const firstMerge = mergeNewItems(101, acceptedItems);
    const secondMerge = mergeNewItems(101, acceptedItems);

    expect(firstMerge.addedCount).toBe(5);
    expect(secondMerge.addedCount).toBe(0);
  });
});
