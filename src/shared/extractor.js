const FEED_SELECTOR =
  'div[componentkey="container-update-list_mainFeed-lazy-container"]';
const POST_SELECTOR = 'div[role="listitem"]';
const PROMOTED_LABELS = ["Promoted", "Publicidad"];
const SUGGESTED_LABELS = ["Suggested", "Sugerido"];
const RELATIONSHIP_MARKERS = ["1st", "2nd", "3rd+", "Following"];
const POSTED_TIME_PATTERN = /^(now|\d+\s*(?:s|m|h|d|w|mo|y))\b/i;
const OVERFLOW_BUTTON_SELECTOR =
  'button[aria-label*="Open control menu for post"]';
const FLOATING_MENU_SELECTOR = 'div[popover="manual"] [role="menu"]';
const MENU_ITEM_SELECTOR = '[role="menuitem"]';

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripExpandableSuffix(text) {
  return text
    .replace(/(?:…|\.{3})\s*more\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPersonLabel(text) {
  if (!text) {
    return null;
  }

  let cleaned = normalizeWhitespace(text);
  cleaned = cleaned.replace(/\bOpen to work\b/gi, " ");
  cleaned = cleaned.replace(/\bHiring\b/gi, " ");
  cleaned = cleaned.replace(/\bVerified Profile\b/gi, " ");
  cleaned = cleaned.replace(/\bPremium\b/gi, " ");
  cleaned = cleaned.replace(/\bProfile\b\s*$/gi, " ");
  cleaned = cleaned.replace(/[,:]+/g, " ");
  cleaned = cleaned.replace(/[•·]+/g, " ");
  cleaned = cleaned.replace(/â€¢|Ã¢â‚¬Â¢|Ã‚Â·/g, " ");
  cleaned = cleaned.replace(/\s+[•·]+\s*$/g, " ");
  cleaned = normalizeWhitespace(cleaned);

  return cleaned || null;
}

function hasRelationshipMarker(text) {
  const normalized = normalizeWhitespace(text || "");
  return RELATIONSHIP_MARKERS.some((marker) => normalized.includes(marker));
}

export function findFeedContainer(root = document) {
  return root.querySelector(FEED_SELECTOR);
}

export function findPostElements(feedContainer) {
  if (!feedContainer) {
    return [];
  }

  return Array.from(feedContainer.querySelectorAll(POST_SELECTOR));
}

export function isPromotedPost(postElement) {
  const paragraphs = Array.from(postElement.querySelectorAll("p"));

  return paragraphs.some((paragraph) => {
    const text = normalizeWhitespace(paragraph.textContent || "");

    return PROMOTED_LABELS.some((label) => text.includes(label));
  });
}

export function isSuggestedPost(postElement) {
  const paragraphs = Array.from(postElement.querySelectorAll("p"));

  return paragraphs.some((paragraph) => {
    const text = normalizeWhitespace(paragraph.textContent || "");

    return SUGGESTED_LABELS.some((label) => text === label);
  });
}

export function findRelationshipSpan(postElement) {
  const candidates = Array.from(postElement.querySelectorAll("span, p"));

  return (
    candidates.find((candidate) => {
      const text = normalizeWhitespace(candidate.textContent || "");
      return hasRelationshipMarker(text);
    }) || null
  );
}

function removeRelationshipMarker(text) {
  if (!text) {
    return null;
  }

  let cleaned = text;
  let hadMarker = false;

  for (const marker of RELATIONSHIP_MARKERS) {
    const markerPattern = new RegExp(
      `\\s*[•\\-·]?\\s*${escapeRegExp(marker)}(?:\\s|$)`,
      "gi",
    );

    if (markerPattern.test(cleaned)) {
      hadMarker = true;
      cleaned = cleaned.replace(markerPattern, " ");
    }
  }

  if (!hadMarker) {
    return null;
  }

  return cleanPersonLabel(cleaned);
}

function extractAuthorFromAriaLabels(postElement) {
  const labelledElements = Array.from(postElement.querySelectorAll("[aria-label]"));

  for (const element of labelledElements) {
    const label = normalizeWhitespace(element.getAttribute("aria-label") || "");

    if (!hasRelationshipMarker(label)) {
      continue;
    }

    const author = removeRelationshipMarker(label);

    if (author) {
      return author;
    }
  }

  return null;
}

function extractAuthorFromProfileAnchors(postElement) {
  const anchors = Array.from(
    postElement.querySelectorAll('a[href*="/in/"], a[href*="/company/"]'),
  );

  for (const anchor of anchors) {
    const author = cleanPersonLabel(anchor.textContent || "");

    if (author) {
      return author;
    }
  }

  return null;
}

export function extractAuthor(postElement) {
  const ariaLabelAuthor = extractAuthorFromAriaLabels(postElement);

  if (ariaLabelAuthor) {
    return ariaLabelAuthor;
  }

  const relationshipSpan = findRelationshipSpan(postElement);

  if (!relationshipSpan) {
    return extractAuthorFromProfileAnchors(postElement);
  }

  let current = relationshipSpan;

  while (current && current !== postElement) {
    const text = normalizeWhitespace(current.textContent || "");
    const author = removeRelationshipMarker(text);

    if (author && author !== text) {
      return author;
    }

    current = current.parentElement;
  }

  return extractAuthorFromProfileAnchors(postElement);
}

export function extractRepostMetadata(postElement) {
  const paragraphs = Array.from(postElement.querySelectorAll("p"));

  for (const paragraph of paragraphs) {
    const text = normalizeWhitespace(paragraph.textContent || "");
    const repostMatch = text.match(/^(.*?)\s+reposted this$/i);

    if (repostMatch) {
      return {
        is_repost: true,
        reposted_by: cleanPersonLabel(repostMatch[1]),
      };
    }

    if (
      /^(.*?)\s+(loves this|supports this|found this insightful)$/i.test(text)
    ) {
      return {
        is_repost: false,
        reposted_by: null,
      };
    }
  }

  return {
    is_repost: false,
    reposted_by: null,
  };
}

export function extractPostText(postElement) {
  const textBox = postElement.querySelector('[data-testid="expandable-text-box"]');

  if (!textBox) {
    return null;
  }

  const text = stripExpandableSuffix(textBox.textContent || "");
  return text || null;
}

export function extractPostedTime(postElement) {
  const paragraphs = Array.from(postElement.querySelectorAll("p"));

  for (const paragraph of paragraphs) {
    const text = normalizeWhitespace(paragraph.textContent || "");
    const match = text.match(POSTED_TIME_PATTERN);

    if (match) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

export function extractAuthorProfileUrl(postElement, author) {
  const anchors = Array.from(
    postElement.querySelectorAll('a[href*="/in/"], a[href*="/company/"]'),
  );
  const normalizedAuthor = normalizeWhitespace(author || "").toLowerCase();

  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    const anchorText = normalizeWhitespace(
      [anchor.textContent || "", anchor.getAttribute("aria-label") || ""].join(
        " ",
      ),
    ).toLowerCase();

    if (!href) {
      continue;
    }

    if (normalizedAuthor && anchorText.includes(normalizedAuthor)) {
      try {
        return new URL(href, window.location.origin).toString();
      } catch {
        return href;
      }
    }
  }

  const firstProfileAnchor = anchors[0]?.getAttribute("href");

  if (!firstProfileAnchor) {
    return null;
  }

  try {
    return new URL(firstProfileAnchor, window.location.origin).toString();
  } catch {
    return firstProfileAnchor;
  }
}

export function findPostOverflowButton(postElement) {
  return postElement?.querySelector(OVERFLOW_BUTTON_SELECTOR) || null;
}

export function findFloatingPostMenu(root = document) {
  return root?.querySelector(FLOATING_MENU_SELECTOR) || null;
}

export function findCopyLinkMenuItem(root = document) {
  const menu = findFloatingPostMenu(root);

  if (!menu) {
    return null;
  }

  return (
    Array.from(menu.querySelectorAll(MENU_ITEM_SELECTOR)).find((item) =>
      normalizeWhitespace(item.textContent || "")
        .toLowerCase()
        .includes("copy link to post"),
    ) || null
  );
}

export function buildFingerprint(postElement, author) {
  const visibleText = normalizeWhitespace(postElement.textContent || "").slice(
    0,
    240,
  );

  return `${author.toLowerCase()}::${visibleText.toLowerCase()}`;
}

export function buildNormalizedItem(
  postElement,
  author,
  repostMetadata,
  now = new Date(),
  options = {},
) {
  return {
    link: options.link || null,
    author,
    author_profile_url: extractAuthorProfileUrl(postElement, author),
    reposted_by: repostMetadata.reposted_by,
    post_text: extractPostText(postElement),
    posted_time: extractPostedTime(postElement),
    is_repost: repostMetadata.is_repost,
    type: "organic",
    extracted_at: now.toISOString(),
    author_role: null,
    author_followers: null,
    author_weight: "low",
    fingerprint: buildFingerprint(postElement, author),
  };
}

export function analyzePostElement(postElement, now = new Date()) {
  if (isPromotedPost(postElement)) {
    return { status: "skipped", reason: "promoted" };
  }

  if (isSuggestedPost(postElement)) {
    return { status: "skipped", reason: "suggested" };
  }

  const author = extractAuthor(postElement);

  if (!author) {
    return { status: "skipped", reason: "missing-author" };
  }

  const repostMetadata = extractRepostMetadata(postElement);

  return {
    status: "accepted",
    item: buildNormalizedItem(postElement, author, repostMetadata, now),
  };
}

export function scanFeedPosts(
  feedContainer,
  {
    processedElements = new WeakMap(),
    nowFactory = () => new Date(),
  } = {},
) {
  const acceptedItems = [];
  const skippedItems = [];

  for (const postElement of findPostElements(feedContainer)) {
    const currentElementSignature = normalizeWhitespace(
      postElement.textContent || "",
    ).slice(0, 240);

    if (processedElements.get(postElement) === currentElementSignature) {
      continue;
    }

    processedElements.set(postElement, currentElementSignature);

    const result = analyzePostElement(postElement, nowFactory());

    if (result.status === "accepted") {
      acceptedItems.push(result.item);
      continue;
    }

    skippedItems.push(result.reason);
  }

  return { acceptedItems, skippedItems };
}
