import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  analyzePostElement,
  extractAuthor,
  extractAuthorProfileUrl,
  extractPostedTime,
  extractPostText,
  extractRepostMetadata,
  findCopyLinkMenuItem,
  findFeedContainer,
  findFloatingPostMenu,
  findPostElements,
  findPostOverflowButton,
  isPromotedPost,
  isSuggestedPost,
  scanFeedPosts,
} from "../src/shared/extractor.js";
import { AI_STATUS } from "../src/shared/constants.js";
import { getSerializableState, mergeNewItems } from "../src/shared/state.js";

const FEED_FIXTURE = `
  <div componentkey="container-update-list_mainFeed-lazy-container">
    <div role="listitem" data-post-id="organic-1">
      <div>
        <p>Regular organic post</p>
        <button
          type="button"
          aria-label="Open control menu for post by Gonzalo Corbijn"
        >
          Open menu
        </button>
        <a href="https://www.linkedin.com/in/gonzalo-corbijn/">Gonzalo Corbijn</a>
        <span aria-hidden="true">
          Gonzalo Corbijn
          <span class="verified"></span>
          <span class="relationship"><span> â€¢ 1st</span></span>
        </span>
        <p>4h •</p>
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
    <div role="listitem" data-post-id="suggested-post">
      <div>
        <p>Suggested</p>
        <a href="https://www.linkedin.com/in/muhammadhaseeb-ai/">Muhammad Haseeb</a>
        <div aria-label="Muhammad Haseeb, Open to work 3rd+"></div>
        <p>15h •</p>
      </div>
      <span data-testid="expandable-text-box">Should be skipped as suggested.</span>
    </div>
    <div role="listitem" data-post-id="aria-label-author">
      <div>
        <a href="https://www.linkedin.com/in/pattyfonacier/">Patty Fonacier</a>
        <div aria-label="Patty Fonacier Premium Profile 1st"></div>
        <p>21h • Edited •</p>
      </div>
      <span data-testid="expandable-text-box">Author should come from aria-label.</span>
    </div>
    <div role="listitem" data-post-id="paragraph-relationship">
      <div>
        <a href="https://www.linkedin.com/in/muhammadhaseeb-ai/">Muhammad Haseeb</a>
        <p>Muhammad Haseeb • 3rd+</p>
        <p>15h •</p>
      </div>
      <span data-testid="expandable-text-box">Author should come from paragraph marker.</span>
    </div>
  </div>
  <div popover="manual">
    <div role="menu">
      <div role="menuitem">Save</div>
      <div role="menuitem">Copy link to post</div>
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
    expect(findPostElements(container)).toHaveLength(10);
  });

  it("filters promoted content", () => {
    const document = setupDocument();
    const posts = findPostElements(findFeedContainer(document));

    expect(isPromotedPost(posts[1])).toBe(true);
    expect(isPromotedPost(posts[0])).toBe(false);
  });

  it("filters suggested content separately from promoted posts", () => {
    const document = setupDocument();
    const posts = findPostElements(findFeedContainer(document));

    expect(isSuggestedPost(posts[7])).toBe(true);
    expect(analyzePostElement(posts[7])).toEqual({
      status: "skipped",
      reason: "suggested",
    });
  });

  it("extracts the author from relationship markers", () => {
    const document = setupDocument();
    const posts = findPostElements(findFeedContainer(document));

    expect(extractAuthor(posts[0])).toBe("Gonzalo Corbijn");
    expect(extractAuthor(posts[2])).toBe("Ada Lovelace");
    expect(extractAuthor(posts[4])).toBe("Kelsey Hightower");
    expect(extractAuthor(posts[6])).toBe("Cruz Gamboa");
    expect(extractAuthor(posts[8])).toBe("Patty Fonacier");
    expect(extractAuthor(posts[9])).toBe("Muhammad Haseeb");
  });

  it("extracts the author profile url when it is present in the post", () => {
    const document = setupDocument();
    const posts = findPostElements(findFeedContainer(document));

    expect(extractAuthorProfileUrl(posts[0], "Gonzalo Corbijn")).toBe(
      "https://www.linkedin.com/in/gonzalo-corbijn/",
    );
    expect(extractAuthorProfileUrl(posts[2], "Ada Lovelace")).toBeNull();
  });

  it("finds the overflow button and floating copy-link menu item", () => {
    const document = setupDocument();
    const posts = findPostElements(findFeedContainer(document));

    expect(findPostOverflowButton(posts[0])).not.toBeNull();
    expect(findFloatingPostMenu(document)).not.toBeNull();
    expect(findCopyLinkMenuItem(document)?.textContent).toContain(
      "Copy link to post",
    );
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

  it("extracts posted time when LinkedIn exposes a relative timestamp", () => {
    const document = setupDocument();
    const posts = findPostElements(findFeedContainer(document));

    expect(extractPostedTime(posts[0])).toBe("4h");
    expect(extractPostedTime(posts[2])).toBeNull();
  });

  it("scans only new elements in repeated rescans", () => {
    const document = setupDocument();
    const container = findFeedContainer(document);
    const processedElements = new WeakMap();

    const firstPass = scanFeedPosts(container, {
      processedElements,
      nowFactory: () => new Date("2026-03-16T20:00:00.000Z"),
    });
    const secondPass = scanFeedPosts(container, { processedElements });

    expect(firstPass.acceptedItems).toHaveLength(7);
    expect(firstPass.skippedItems).toContain("promoted");
    expect(firstPass.skippedItems).toContain("missing-author");
    expect(firstPass.skippedItems).toContain("suggested");
    expect(firstPass.acceptedItems[0]).toMatchObject({
      author: "Gonzalo Corbijn",
      author_profile_url: "https://www.linkedin.com/in/gonzalo-corbijn/",
      author_role: null,
      author_followers: null,
      author_weight: "low",
      post_text: "Full organic text with a hidden ending.",
      posted_time: "4h",
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
    expect(firstPass.acceptedItems[5]).toMatchObject({
      author: "Patty Fonacier",
      post_text: "Author should come from aria-label.",
    });
    expect(firstPass.acceptedItems[6]).toMatchObject({
      author: "Muhammad Haseeb",
      post_text: "Author should come from paragraph marker.",
    });
    expect(secondPass.acceptedItems).toHaveLength(0);
  });

  it("deduplicates accepted items by fingerprint in shared state", () => {
    const document = setupDocument();
    const container = findFeedContainer(document);
    const { acceptedItems } = scanFeedPosts(container, {
      processedElements: new WeakMap(),
      nowFactory: () => new Date("2026-03-16T20:00:00.000Z"),
    });

    const firstMerge = mergeNewItems(101, acceptedItems);
    const secondMerge = mergeNewItems(101, acceptedItems);

    expect(firstMerge.addedCount).toBe(7);
    expect(secondMerge.addedCount).toBe(0);
    expect(getSerializableState(101).aiCounts).toEqual({
      pending: 7,
      interested: 0,
      not_interested: 0,
      unknown: 0,
    });
    expect(firstMerge.state.items[0].interest_validation.status).toBe(
      AI_STATUS.pending,
    );
  });
});
