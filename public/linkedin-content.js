(function () {
  const FEED_SELECTOR =
    'div[componentkey="container-update-list_mainFeed-lazy-container"]';
  const POST_SELECTOR = 'div[role="listitem"]';
  const PROMOTED_LABELS = ["Promoted", "Publicidad"];
  const RELATIONSHIP_MARKERS = ["1st", "2nd", "3rd+", "Following"];

  const MESSAGE_TYPES = {
    feedReady: "collector/feed-ready",
    newItems: "collector/new-items",
  };

  const STATUS_TEXT = {
    attached: "Collector attached to LinkedIn feed.",
    unavailable: "LinkedIn feed container not found on this view.",
  };

  const STORAGE_KEYS = {
    status: "collector.status",
  };

  const processedElements = new WeakSet();
  let feedObserver = null;
  let rootObserver = null;
  let pendingScan = false;

  bootstrapCollector();

  function bootstrapCollector() {
    attachToFeedIfPresent();

    rootObserver = new MutationObserver(function () {
      attachToFeedIfPresent();
    });

    if (document.body) {
      rootObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  function normalizeWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findFeedContainer(root) {
    return (root || document).querySelector(FEED_SELECTOR);
  }

  function findPostElements(feedContainer) {
    if (!feedContainer) {
      return [];
    }

    return Array.from(feedContainer.querySelectorAll(POST_SELECTOR));
  }

  function isPromotedPost(postElement) {
    const paragraphs = Array.from(postElement.querySelectorAll("p"));

    return paragraphs.some(function (paragraph) {
      const text = normalizeWhitespace(paragraph.textContent || "");

      return PROMOTED_LABELS.some(function (label) {
        return text.includes(label);
      });
    });
  }

  function findRelationshipSpan(postElement) {
    const spans = Array.from(postElement.querySelectorAll("span"));

    return (
      spans.find(function (span) {
        const text = normalizeWhitespace(span.textContent || "");

        return RELATIONSHIP_MARKERS.some(function (marker) {
          return text.includes(marker);
        });
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
        "\\s*[•\\-·]?\\s*" + escapeRegExp(marker) + "(?:\\s|$)",
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

    cleaned = cleaned.replace(/\bVerified Profile\b/gi, " ");
    cleaned = cleaned.replace(/\bPremium\b/gi, " ");
    cleaned = cleaned.replace(/[•·-]+/g, " ");
    cleaned = normalizeWhitespace(cleaned);

    return cleaned || null;
  }

  function extractAuthor(postElement) {
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

  function buildFingerprint(postElement, author) {
    const visibleText = normalizeWhitespace(postElement.textContent || "").slice(
      0,
      240,
    );

    return author.toLowerCase() + "::" + visibleText.toLowerCase();
  }

  function buildNormalizedItem(postElement, author, now) {
    return {
      link: null,
      author: author,
      post_text: null,
      is_repost: null,
      type: "organic",
      extracted_at: now.toISOString(),
      fingerprint: buildFingerprint(postElement, author),
    };
  }

  function scanFeedPosts(feedContainer) {
    const acceptedItems = [];
    const skippedItems = [];

    for (const postElement of findPostElements(feedContainer)) {
      if (processedElements.has(postElement)) {
        continue;
      }

      processedElements.add(postElement);

      if (isPromotedPost(postElement)) {
        skippedItems.push("promoted");
        continue;
      }

      const author = extractAuthor(postElement);

      if (!author) {
        skippedItems.push("missing-author");
        continue;
      }

      acceptedItems.push(buildNormalizedItem(postElement, author, new Date()));
    }

    return { acceptedItems: acceptedItems, skippedItems: skippedItems };
  }

  function attachToFeedIfPresent() {
    const feedContainer = findFeedContainer(document);

    if (!feedContainer) {
      console.log("[harvester] feed container not found yet");
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.feedReady,
        feedFound: false,
      });
      chrome.storage.local.set({
        [STORAGE_KEYS.status]: STATUS_TEXT.unavailable,
      });
      return;
    }

    if (feedObserver && feedObserver.feedContainer === feedContainer) {
      return;
    }

    if (feedObserver) {
      feedObserver.disconnect();
    }

    feedObserver = new MutationObserver(function () {
      scheduleScan(feedContainer);
    });
    feedObserver.feedContainer = feedContainer;
    feedObserver.observe(feedContainer, {
      childList: true,
      subtree: true,
    });

    console.log("[harvester] feed container attached", {
      listItemsInView: findPostElements(feedContainer).length,
    });

    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.feedReady,
      feedFound: true,
    });
    chrome.storage.local.set({
      [STORAGE_KEYS.status]: STATUS_TEXT.attached,
    });

    scheduleScan(feedContainer);
  }

  function scheduleScan(feedContainer) {
    if (pendingScan) {
      return;
    }

    pendingScan = true;

    queueMicrotask(function () {
      pendingScan = false;
      runScan(feedContainer);
    });
  }

  function runScan(feedContainer) {
    const totalListItems = findPostElements(feedContainer).length;
    const scanResult = scanFeedPosts(feedContainer);

    console.log("[harvester] scan complete", {
      totalListItems: totalListItems,
      accepted: scanResult.acceptedItems.length,
      skipped: scanResult.skippedItems.length,
    });

    for (const item of scanResult.acceptedItems) {
      const loggable = Object.assign({}, item);
      delete loggable.fingerprint;
      console.log("[harvester] item found", loggable);
    }

    for (const reason of scanResult.skippedItems) {
      if (reason === "missing-author") {
        console.log("[harvester] skipped item", { reason: reason });
      }
    }

    if (!scanResult.acceptedItems.length) {
      return;
    }

    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.newItems,
      items: scanResult.acceptedItems,
    });
  }
})();
