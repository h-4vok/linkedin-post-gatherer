const FEED_SELECTOR =
  'div[componentkey="container-update-list_mainFeed-lazy-container"]';
const POST_SELECTOR = 'div[role="listitem"]';
const PROMOTED_LABELS = ["Promoted", "Publicidad"];
const RELATIONSHIP_MARKERS = ["1st", "2nd", "3rd+", "Following"];

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
  cleaned = cleaned.replace(/\bVerified Profile\b/gi, " ");
  cleaned = cleaned.replace(/\bPremium\b/gi, " ");
  cleaned = cleaned.replace(/\bProfile\b\s*$/gi, " ");
  cleaned = cleaned.replace(/[•·]+/g, " ");
  cleaned = cleaned.replace(/â€¢|Â·/g, " ");
  cleaned = cleaned.replace(/\s+[•·]+\s*$/g, " ");
  cleaned = normalizeWhitespace(cleaned);

  return cleaned || null;
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

export function findRelationshipSpan(postElement) {
  const spans = Array.from(postElement.querySelectorAll("span"));

  return (
    spans.find((span) => {
      const text = normalizeWhitespace(span.textContent || "");
      return RELATIONSHIP_MARKERS.some((marker) => text.includes(marker));
    }) || null
  );
}

export function extractAuthor(postElement) {
  const relationshipSpan = findRelationshipSpan(postElement);

  if (!relationshipSpan) {
    return null;
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

  return null;
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
) {
  return {
    link: null,
    author,
    reposted_by: repostMetadata.reposted_by,
    post_text: extractPostText(postElement),
    is_repost: repostMetadata.is_repost,
    type: "organic",
    extracted_at: now.toISOString(),
    fingerprint: buildFingerprint(postElement, author),
  };
}

export function analyzePostElement(postElement, now = new Date()) {
  if (isPromotedPost(postElement)) {
    return { status: "skipped", reason: "promoted" };
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
  { processedElements = new WeakSet(), nowFactory = () => new Date() } = {},
) {
  const acceptedItems = [];
  const skippedItems = [];

  for (const postElement of findPostElements(feedContainer)) {
    if (processedElements.has(postElement)) {
      continue;
    }

    processedElements.add(postElement);

    const result = analyzePostElement(postElement, nowFactory());

    if (result.status === "accepted") {
      acceptedItems.push(result.item);
      continue;
    }

    skippedItems.push(result.reason);
  }

  return { acceptedItems, skippedItems };
}
