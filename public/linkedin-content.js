(function () {
  const FEED_SELECTOR =
    'div[componentkey="container-update-list_mainFeed-lazy-container"]';
  const POST_SELECTOR = 'div[role="listitem"]';
  const PROMOTED_LABELS = ["Promoted", "Publicidad"];
  const RELATIONSHIP_MARKERS = ["1st", "2nd", "3rd+", "Following"];
  const PANEL_ROOT_ID = "linkedin-intelligence-harvester-root";
  const DEFAULT_PANEL_POSITION = { top: 96, right: 24 };

  const MESSAGE_TYPES = {
    feedReady: "collector/feed-ready",
    newItems: "collector/new-items",
    countUpdated: "collector/count-updated",
    getState: "collector/get-state",
    exportRequest: "collector/export-request",
  };

  const STATUS_TEXT = {
    idle: "Waiting for LinkedIn feed...",
    attached: "Collector attached to LinkedIn feed.",
    scanning: "Collector attached and scanning new posts.",
    unavailable: "LinkedIn feed container not found on this view.",
  };

  const STORAGE_KEYS = {
    panelPosition: "collector.panel.position",
    panelMinimized: "collector.panel.minimized",
  };

  const processedElements = new WeakSet();
  const uiState = {
    count: 0,
    repostCount: 0,
    status: STATUS_TEXT.idle,
    panelPosition: { ...DEFAULT_PANEL_POSITION },
    panelMinimized: false,
    feedVisible: false,
  };

  let feedObserver = null;
  let rootObserver = null;
  let pendingScan = false;
  let panel = null;
  let dragState = null;

  void bootstrapCollector();

  async function bootstrapCollector() {
    await hydrateUiState();
    mountPanel();
    attachToFeedIfPresent();

    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    window.addEventListener("resize", handleViewportResize);

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

  async function hydrateUiState() {
    const [stored, response] = await Promise.all([
      chrome.storage.local.get([
        STORAGE_KEYS.panelPosition,
        STORAGE_KEYS.panelMinimized,
      ]),
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.getState,
      }),
    ]);

    uiState.count = response?.state?.count || 0;
    uiState.repostCount = response?.state?.repostCount || 0;
    uiState.status = response?.state?.status || STATUS_TEXT.idle;
    uiState.panelPosition = clampPanelPosition(
      stored[STORAGE_KEYS.panelPosition] || DEFAULT_PANEL_POSITION,
      { minimized: stored[STORAGE_KEYS.panelMinimized] || false },
    );
    uiState.panelMinimized = Boolean(stored[STORAGE_KEYS.panelMinimized]);
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local") {
      return;
    }

    if (changes[STORAGE_KEYS.panelPosition]) {
      uiState.panelPosition = clampPanelPosition(
        changes[STORAGE_KEYS.panelPosition].newValue || DEFAULT_PANEL_POSITION,
        { minimized: uiState.panelMinimized },
      );
    }

    if (changes[STORAGE_KEYS.panelMinimized]) {
      uiState.panelMinimized = Boolean(
        changes[STORAGE_KEYS.panelMinimized].newValue,
      );
    }

    renderPanel();
  }

  function handleRuntimeMessage(message) {
    if (message?.type !== MESSAGE_TYPES.countUpdated) {
      return;
    }

    uiState.count = message.count || 0;
    uiState.repostCount = message.repostCount || 0;
    uiState.status = message.status || STATUS_TEXT.idle;
    renderPanel();
  }

  function handleViewportResize() {
    uiState.panelPosition = clampPanelPosition(uiState.panelPosition, {
      minimized: uiState.panelMinimized,
    });
    applyPanelPosition();
    void persistPanelPreferences();
  }

  function normalizeWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

    return cleanPersonLabel(cleaned);
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

  function extractRepostMetadata(postElement) {
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

  function buildFingerprint(postElement, author) {
    const visibleText = normalizeWhitespace(postElement.textContent || "").slice(
      0,
      240,
    );

    return author.toLowerCase() + "::" + visibleText.toLowerCase();
  }

  function buildNormalizedItem(postElement, author, repostMetadata, now) {
    return {
      link: null,
      author: author,
      reposted_by: repostMetadata.reposted_by,
      post_text: null,
      is_repost: repostMetadata.is_repost,
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

      const repostMetadata = extractRepostMetadata(postElement);

      acceptedItems.push(
        buildNormalizedItem(postElement, author, repostMetadata, new Date()),
      );
    }

    return { acceptedItems: acceptedItems, skippedItems: skippedItems };
  }

  function attachToFeedIfPresent() {
    const feedContainer = findFeedContainer(document);

    if (!feedContainer) {
      uiState.feedVisible = false;
      uiState.status = STATUS_TEXT.unavailable;
      renderPanel();
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

    uiState.feedVisible = true;
    renderPanel();

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

  function mountPanel() {
    if (panel) {
      renderPanel();
      return panel;
    }

    const host = document.createElement("div");
    host.id = PANEL_ROOT_ID;
    host.style.position = "fixed";
    host.style.top = "0";
    host.style.right = "0";
    host.style.zIndex = "2147483645";
    host.style.pointerEvents = "none";

    const shadowRoot = host.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .harvester-shell {
          position: fixed;
          display: grid;
          gap: 0;
          width: 320px;
          background: #f3efe6;
          color: #18222d;
          border: 1px solid rgba(24, 34, 45, 0.12);
          border-radius: 18px;
          box-shadow: 0 18px 40px rgba(24, 34, 45, 0.22);
          overflow: hidden;
          pointer-events: auto;
          font-family: "Segoe UI", sans-serif;
        }

        .harvester-shell[data-state="minimized"] {
          width: 164px;
          border-radius: 999px;
        }

        .harvester-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px 12px;
          background: linear-gradient(135deg, #fff8ee 0%, #f3efe6 100%);
          cursor: grab;
          user-select: none;
        }

        .harvester-header:active {
          cursor: grabbing;
        }

        .harvester-eyebrow {
          margin: 0 0 6px;
          color: #7c4f22;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .harvester-title {
          margin: 0;
          font-size: 20px;
          line-height: 1.1;
          font-weight: 800;
        }

        .harvester-minimize {
          border: 0;
          border-radius: 999px;
          min-width: 34px;
          height: 34px;
          background: rgba(10, 102, 194, 0.12);
          color: #0a66c2;
          font-size: 20px;
          line-height: 1;
          font-weight: 700;
          cursor: pointer;
        }

        .harvester-body {
          display: grid;
          gap: 12px;
          padding: 0 16px 16px;
        }

        .harvester-status,
        .harvester-count,
        .harvester-feedback,
        .harvester-chip {
          margin: 0;
          font-size: 14px;
          line-height: 1.4;
        }

        .harvester-status {
          color: #43576b;
        }

        .harvester-count {
          font-weight: 800;
        }

        .harvester-export {
          border: 0;
          border-radius: 999px;
          padding: 12px 14px;
          background: #0a66c2;
          color: #ffffff;
          cursor: pointer;
          font-size: 14px;
          font-weight: 800;
        }

        .harvester-export:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .harvester-feedback {
          color: #43576b;
          min-height: 20px;
        }

        .harvester-chip {
          display: none;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          border: 0;
          border-radius: 999px;
          padding: 14px 16px;
          background: #0a66c2;
          color: #ffffff;
          cursor: pointer;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.02em;
        }

        .harvester-chip-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 28px;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.18);
        }

        .harvester-shell[data-state="minimized"] .harvester-header,
        .harvester-shell[data-state="minimized"] .harvester-body {
          display: none;
        }

        .harvester-shell[data-state="minimized"] .harvester-chip {
          display: inline-flex;
        }
      </style>
      <section class="harvester-shell" data-state="expanded">
        <header class="harvester-header" data-drag-handle="true">
          <div>
            <p class="harvester-eyebrow">LinkedIn Intelligence Harvester</p>
            <h2 class="harvester-title">Current Batch</h2>
          </div>
          <button class="harvester-minimize" type="button" aria-label="Minimize panel">-</button>
        </header>
        <div class="harvester-body">
          <p class="harvester-status">Waiting for LinkedIn feed...</p>
          <p class="harvester-count">Posts identified: 0 / live</p>
          <p class="harvester-reposts">Reposts identified: 0</p>
          <button class="harvester-export" type="button">Export JSON</button>
          <p class="harvester-feedback" aria-live="polite"></p>
        </div>
        <button class="harvester-chip" type="button" hidden>
          Harvester <span class="harvester-chip-count">0</span>
        </button>
      </section>
    `;

    document.documentElement.appendChild(host);

    panel = {
      host: host,
      shadowRoot: shadowRoot,
      shell: shadowRoot.querySelector(".harvester-shell"),
      header: shadowRoot.querySelector(".harvester-header"),
      minimizeButton: shadowRoot.querySelector(".harvester-minimize"),
      status: shadowRoot.querySelector(".harvester-status"),
      count: shadowRoot.querySelector(".harvester-count"),
      reposts: shadowRoot.querySelector(".harvester-reposts"),
      exportButton: shadowRoot.querySelector(".harvester-export"),
      feedback: shadowRoot.querySelector(".harvester-feedback"),
      chip: shadowRoot.querySelector(".harvester-chip"),
      chipCount: shadowRoot.querySelector(".harvester-chip-count"),
    };

    panel.header.addEventListener("mousedown", handleDragStart);
    panel.minimizeButton.addEventListener("click", function (event) {
      event.stopPropagation();
      void setPanelMinimized(true);
    });
    panel.chip.addEventListener("click", function () {
      void setPanelMinimized(false);
    });
    panel.exportButton.addEventListener("click", function () {
      void exportCurrentBatch();
    });

    renderPanel();
    return panel;
  }

  function renderPanel() {
    if (!panel) {
      return;
    }

    panel.host.style.display = uiState.feedVisible ? "block" : "none";
    panel.shell.dataset.state = uiState.panelMinimized ? "minimized" : "expanded";
    panel.status.textContent = uiState.status;
    panel.count.textContent = "Posts identified: " + uiState.count + " / live";
    panel.reposts.textContent =
      "Reposts identified: " + uiState.repostCount;
    panel.chipCount.textContent = String(uiState.count);
    panel.chip.hidden = !uiState.panelMinimized;
    applyPanelPosition();
  }

  function applyPanelPosition() {
    if (!panel) {
      return;
    }

    panel.shell.style.top = uiState.panelPosition.top + "px";
    panel.shell.style.right = uiState.panelPosition.right + "px";
    panel.shell.style.width = uiState.panelMinimized ? "164px" : "320px";
  }

  async function exportCurrentBatch() {
    if (!panel) {
      return;
    }

    panel.exportButton.disabled = true;
    panel.feedback.textContent = "Preparing JSON export...";

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.exportRequest,
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Export failed");
      }

      panel.feedback.textContent = "Downloaded " + response.filename;
    } catch (error) {
      panel.feedback.textContent = error.message;
    } finally {
      panel.exportButton.disabled = false;
    }
  }

  function handleDragStart(event) {
    if (!panel || uiState.panelMinimized) {
      return;
    }

    if (event.target.closest("button")) {
      return;
    }

    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      startTop: uiState.panelPosition.top,
      startRight: uiState.panelPosition.right,
    };

    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);
  }

  function handleDragMove(event) {
    if (!dragState) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    uiState.panelPosition = clampPanelPosition(
      {
        top: dragState.startTop + deltaY,
        right: dragState.startRight - deltaX,
      },
      { minimized: false },
    );

    applyPanelPosition();
  }

  function handleDragEnd() {
    if (!dragState) {
      return;
    }

    dragState = null;
    window.removeEventListener("mousemove", handleDragMove);
    window.removeEventListener("mouseup", handleDragEnd);
    void persistPanelPreferences();
  }

  async function setPanelMinimized(nextValue) {
    uiState.panelMinimized = nextValue;
    uiState.panelPosition = clampPanelPosition(uiState.panelPosition, {
      minimized: nextValue,
    });
    renderPanel();
    await persistPanelPreferences();
  }

  async function persistPanelPreferences() {
    await chrome.storage.local.set({
      [STORAGE_KEYS.panelPosition]: uiState.panelPosition,
      [STORAGE_KEYS.panelMinimized]: uiState.panelMinimized,
    });
  }

  function clampPanelPosition(position, options) {
    const isMinimized = Boolean(options?.minimized);
    const width = isMinimized ? 164 : 320;
    const height = isMinimized ? 52 : 196;
    const maxRight = Math.max(12, window.innerWidth - width - 12);
    const maxTop = Math.max(12, window.innerHeight - height - 12);

    return {
      top: Math.min(Math.max(12, numberOr(position?.top, 96)), maxTop),
      right: Math.min(Math.max(12, numberOr(position?.right, 24)), maxRight),
    };
  }

  function numberOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }
})();
