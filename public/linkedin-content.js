(function () {
  const FEED_SELECTOR =
    'div[componentkey="container-update-list_mainFeed-lazy-container"]';
  const POST_SELECTOR = 'div[role="listitem"]';
  const PROMOTED_LABELS = ["Promoted", "Publicidad"];
  const RELATIONSHIP_MARKERS = ["1st", "2nd", "3rd+", "Following"];
  const POSTED_TIME_PATTERN = /^(now|\d+\s*(?:s|m|h|d|w|mo|y))\b/i;
  const PANEL_ROOT_ID = "linkedin-intelligence-harvester-root";
  const DEFAULT_PANEL_POSITION = { top: 96, right: 24 };
  const TARGET_COUNT_DEFAULT = 50;
  const TARGET_COUNT_MIN = 1;
  const TARGET_COUNT_MAX = 200;
  const RUN_STATES = {
    idle: "idle",
    running: "running",
    stopping: "stopping",
    stopped: "stopped",
    completed: "completed",
    unavailable: "unavailable",
  };
  const SCROLL_STEP_MIN = 400;
  const SCROLL_STEP_MAX = 600;
  const SCROLL_DELAY_MIN_MS = 1500;
  const SCROLL_DELAY_MAX_MS = 3500;
  const LONG_WAIT_MS = 300000;

  const MESSAGE_TYPES = {
    feedReady: "collector/feed-ready",
    newItems: "collector/new-items",
    countUpdated: "collector/count-updated",
    getState: "collector/get-state",
    setTargetRequest: "collector/set-target-request",
    startRequest: "collector/start-request",
    stopRequest: "collector/stop-request",
    crawlerCommand: "collector/crawler-command",
    crawlerProgress: "collector/crawler-progress",
    log: "collector/log",
    exportRequest: "collector/export-request",
  };

  const STATUS_TEXT = {
    idle: "Waiting for LinkedIn feed...",
    attached: "Ready to collect.",
    scanning: "Scrolling and collecting posts.",
    stopping: "Stopping crawler.",
    stopped: "Stopped by user.",
    completed: "Target reached.",
    stalled: "Feed exhausted or stalled.",
    unavailable: "LinkedIn feed container not found on this view.",
  };

  const STORAGE_KEYS = {
    panelPosition: "collector.panel.position",
    panelMinimized: "collector.panel.minimized",
  };

  const processedElements = new WeakMap();
  const uiState = {
    count: 0,
    repostCount: 0,
    status: STATUS_TEXT.idle,
    runState: RUN_STATES.idle,
    targetCount: TARGET_COUNT_DEFAULT,
    noProgressCycles: 0,
    stalledWaitCount: 0,
    panelPosition: { ...DEFAULT_PANEL_POSITION },
    panelMinimized: false,
    feedVisible: false,
  };

  let rootObserver = null;
  let panel = null;
  let dragState = null;
  let crawlRunId = 0;
  let crawlShouldStop = false;
  let activeFeedContainer = null;
  let extensionContextAvailable = true;

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
      safeStorageLocalGet([
        STORAGE_KEYS.panelPosition,
        STORAGE_KEYS.panelMinimized,
      ]),
      safeSendMessage({
        type: MESSAGE_TYPES.getState,
      }),
    ]);

    uiState.count = response?.state?.count || 0;
    uiState.repostCount = response?.state?.repostCount || 0;
    uiState.status = response?.state?.status || STATUS_TEXT.idle;
    uiState.runState = response?.state?.runState || RUN_STATES.idle;
    uiState.targetCount = clampTargetCount(response?.state?.targetCount);
    uiState.noProgressCycles = response?.state?.noProgressCycles || 0;
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
    if (message?.type === MESSAGE_TYPES.countUpdated) {
      uiState.count = message.count || 0;
      uiState.repostCount = message.repostCount || 0;
      uiState.status = message.status || STATUS_TEXT.idle;
      uiState.runState = message.runState || RUN_STATES.idle;
      uiState.targetCount = clampTargetCount(message.targetCount);
      uiState.noProgressCycles = message.noProgressCycles || 0;
      uiState.stalledWaitCount = message.stalledWaitCount || 0;
      renderPanel();
      return;
    }

    if (message?.type !== MESSAGE_TYPES.crawlerCommand) {
      return;
    }

    if (message.action === "start") {
      void startCrawlerLoop(message.targetCount);
      return;
    }

    if (message.action === "stop") {
      crawlShouldStop = true;
    }
  }

  function handleViewportResize() {
    uiState.panelPosition = clampPanelPosition(uiState.panelPosition, {
      minimized: uiState.panelMinimized,
    });
    applyPanelPosition();
    void persistPanelPreferences();
  }

  function clampTargetCount(value) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed)) {
      return TARGET_COUNT_DEFAULT;
    }

    return Math.min(TARGET_COUNT_MAX, Math.max(TARGET_COUNT_MIN, parsed));
  }

  function randomBetween(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function sleep(durationMs) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, durationMs);
    });
  }

  function isScrollableElement(element) {
    if (!element || element === document.body || element === document.documentElement) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY || "";

    return (
      /(auto|scroll|overlay)/i.test(overflowY) &&
      element.scrollHeight > element.clientHeight + 8
    );
  }

  function describeScrollContainer(element) {
    if (!element) {
      return "none";
    }

    if (
      element === document.scrollingElement ||
      element === document.documentElement ||
      element === document.body
    ) {
      return "document";
    }

    const tagName = (element.tagName || "unknown").toLowerCase();
    const idPart = element.id ? "#" + element.id : "";
    const classPart =
      typeof element.className === "string" && element.className.trim()
        ? "." + element.className.trim().split(/\s+/).slice(0, 2).join(".")
        : "";

    return tagName + idPart + classPart;
  }

  function findScrollableContainer(feedContainer) {
    let current = feedContainer;

    while (current && current !== document.body && current !== document.documentElement) {
      if (isScrollableElement(current)) {
        return current;
      }

      current = current.parentElement;
    }

    return document.scrollingElement || document.documentElement || document.body;
  }

  function performScrollStep(feedContainer, scrollStep) {
    const scrollingElement = findScrollableContainer(feedContainer);
    const usesDocumentScroll =
      scrollingElement === document.scrollingElement ||
      scrollingElement === document.documentElement ||
      scrollingElement === document.body;
    const beforeTop = usesDocumentScroll
      ? window.scrollY || scrollingElement.scrollTop || 0
      : scrollingElement.scrollTop || 0;
    const nextTop = beforeTop + scrollStep;

    if (usesDocumentScroll) {
      try {
        scrollingElement.scrollTo({
          top: nextTop,
          behavior: "auto",
        });
      } catch {
        scrollingElement.scrollTop = nextTop;
      }

      try {
        window.scrollTo({
          top: nextTop,
          behavior: "auto",
        });
      } catch {
        window.scrollTo(0, nextTop);
      }
    } else {
      try {
        scrollingElement.scrollTo({
          top: nextTop,
          behavior: "auto",
        });
      } catch {
        scrollingElement.scrollTop = nextTop;
      }
    }

    const afterTop = usesDocumentScroll
      ? window.scrollY || scrollingElement.scrollTop || 0
      : scrollingElement.scrollTop || 0;

    return {
      beforeTop,
      afterTop,
      moved: afterTop !== beforeTop,
      container: describeScrollContainer(scrollingElement),
      usesDocumentScroll,
    };
  }

  function isExtensionContextAvailable() {
    if (!extensionContextAvailable) {
      return false;
    }

    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      extensionContextAvailable = false;
      return false;
    }
  }

  function handleExtensionContextError(error) {
    if (
      error &&
      typeof error.message === "string" &&
      error.message.includes("Extension context invalidated")
    ) {
      extensionContextAvailable = false;
      rootObserver?.disconnect();
      activeFeedContainer = null;
      crawlShouldStop = true;
      return true;
    }

    return false;
  }

  async function safeSendMessage(message) {
    if (!isExtensionContextAvailable()) {
      return null;
    }

    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (handleExtensionContextError(error)) {
        return null;
      }

      throw error;
    }
  }

  async function safeStorageLocalGet(keys) {
    if (!isExtensionContextAvailable()) {
      return {};
    }

    try {
      return await chrome.storage.local.get(keys);
    } catch (error) {
      if (handleExtensionContextError(error)) {
        return {};
      }

      throw error;
    }
  }

  async function safeStorageLocalSet(payload) {
    if (!isExtensionContextAvailable()) {
      return;
    }

    try {
      await chrome.storage.local.set(payload);
    } catch (error) {
      if (!handleExtensionContextError(error)) {
        throw error;
      }
    }
  }

  function logPage(event, payload) {
    console.log("[harvester]", event, payload || {});
  }

  function logToServiceWorker(event, payload) {
    return safeSendMessage({
      type: MESSAGE_TYPES.log,
      event: event,
      payload: payload || null,
    });
  }

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

  function extractPostText(postElement) {
    const textBox = postElement.querySelector(
      '[data-testid="expandable-text-box"]',
    );

    if (!textBox) {
      return null;
    }

    const text = stripExpandableSuffix(textBox.textContent || "");
    return text || null;
  }

  function extractPostedTime(postElement) {
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
      post_text: extractPostText(postElement),
      posted_time: extractPostedTime(postElement),
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
      const currentElementSignature = normalizeWhitespace(
        postElement.textContent || "",
      ).slice(0, 240);

      if (processedElements.get(postElement) === currentElementSignature) {
        continue;
      }

      processedElements.set(postElement, currentElementSignature);

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
      const shouldNotifyUnavailable =
        uiState.feedVisible || uiState.runState !== RUN_STATES.unavailable;

      activeFeedContainer = null;
      uiState.feedVisible = false;
      uiState.status = STATUS_TEXT.unavailable;
      uiState.runState = RUN_STATES.unavailable;
      renderPanel();
      if (shouldNotifyUnavailable) {
        logPage("feed container not found yet");
        void safeSendMessage({
          type: MESSAGE_TYPES.feedReady,
          feedFound: false,
        });
      }
      return;
    }

    if (activeFeedContainer === feedContainer && uiState.feedVisible) {
      return;
    }

    activeFeedContainer = feedContainer;

    uiState.feedVisible = true;
    renderPanel();

    logPage("feed container attached", {
      listItemsInView: findPostElements(feedContainer).length,
    });

    void safeSendMessage({
      type: MESSAGE_TYPES.feedReady,
      feedFound: true,
    });
  }

  async function runScan(feedContainer) {
    const totalListItems = findPostElements(feedContainer).length;
    const scanResult = scanFeedPosts(feedContainer);

    logPage("scan complete", {
      totalListItems: totalListItems,
      accepted: scanResult.acceptedItems.length,
      skipped: scanResult.skippedItems.length,
    });

    await logToServiceWorker("scan-results", {
      totalListItems: totalListItems,
      accepted: scanResult.acceptedItems.length,
      skipped: scanResult.skippedItems.length,
    });

    for (const item of scanResult.acceptedItems) {
      const loggable = Object.assign({}, item);
      delete loggable.fingerprint;
      logPage("item found", loggable);
    }

    for (const reason of scanResult.skippedItems) {
      if (reason === "missing-author") {
        logPage("skipped item", { reason: reason });
      }
    }

    let addedCount = 0;

    if (scanResult.acceptedItems.length) {
      const response = await safeSendMessage({
        type: MESSAGE_TYPES.newItems,
        items: scanResult.acceptedItems,
      });

      addedCount = response?.addedCount || 0;
    }

    return safeSendMessage({
      type: MESSAGE_TYPES.crawlerProgress,
      addedCount: addedCount,
      totalListItems: totalListItems,
    });
  }

  async function startCrawlerLoop(targetCount) {
    const requestedTarget = clampTargetCount(targetCount);
    const feedContainer = findFeedContainer(document);

    if (!feedContainer) {
      uiState.feedVisible = false;
      uiState.runState = RUN_STATES.unavailable;
      uiState.status = STATUS_TEXT.unavailable;
      renderPanel();
      await logToServiceWorker("crawler-start-blocked", {
        reason: "feed-unavailable",
      });
      await safeSendMessage({
        type: MESSAGE_TYPES.crawlerProgress,
        phase: "stopped",
        reason: "unavailable",
      });
      return;
    }

    crawlRunId += 1;
    crawlShouldStop = false;
    const activeRunId = crawlRunId;

    await logToServiceWorker("crawler-started", {
      targetCount: requestedTarget,
    });

    while (activeRunId === crawlRunId && !crawlShouldStop) {
      const currentFeedContainer = findFeedContainer(document);

      if (!currentFeedContainer) {
        await logToServiceWorker("crawler-stopped", {
          reason: "feed-unavailable",
        });
        await safeSendMessage({
          type: MESSAGE_TYPES.feedReady,
          feedFound: false,
        });
        await safeSendMessage({
          type: MESSAGE_TYPES.crawlerProgress,
          phase: "stopped",
          reason: "unavailable",
        });
        return;
      }

      await logToServiceWorker("scan-cycle-started", {
        runId: activeRunId,
        targetCount: requestedTarget,
        currentCount: uiState.count,
      });

      const progressResponse = await runScan(currentFeedContainer);

      if (progressResponse?.shouldStop) {
        await logToServiceWorker("crawler-stop-condition", {
          reason: progressResponse.stopReason,
          count: progressResponse.state?.count || uiState.count,
        });
        break;
      }

      const scrollStep = randomBetween(SCROLL_STEP_MIN, SCROLL_STEP_MAX);
      const scrollResult = performScrollStep(currentFeedContainer, scrollStep);
      await logToServiceWorker("scroll-applied", {
        scrollStep: scrollStep,
        beforeTop: scrollResult.beforeTop,
        afterTop: scrollResult.afterTop,
        moved: scrollResult.moved,
        container: scrollResult.container,
        usesDocumentScroll: scrollResult.usesDocumentScroll,
      });

      const waitMs = randomBetween(SCROLL_DELAY_MIN_MS, SCROLL_DELAY_MAX_MS);
      const effectiveWaitMs = progressResponse?.shouldLongWait
        ? progressResponse.longWaitMs || LONG_WAIT_MS
        : waitMs;

      if (progressResponse?.shouldLongWait) {
        await logToServiceWorker("long-wait-scheduled", {
          waitMs: effectiveWaitMs,
          stalledWaitCount: uiState.stalledWaitCount,
        });
      } else {
        await logToServiceWorker("wait-scheduled", {
          waitMs: effectiveWaitMs,
        });
      }

      await sleep(effectiveWaitMs);
    }

    if (crawlShouldStop) {
      await logToServiceWorker("crawler-stop-condition", {
        reason: "user",
      });
      await safeSendMessage({
        type: MESSAGE_TYPES.crawlerProgress,
        phase: "stopped",
        reason: "user",
      });
    }
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

        .harvester-target-row,
        .harvester-actions {
          display: grid;
          gap: 8px;
        }

        .harvester-target-row {
          grid-template-columns: 1fr 96px;
          align-items: end;
        }

        .harvester-label {
          display: grid;
          gap: 4px;
          margin: 0;
          color: #43576b;
          font-size: 12px;
          font-weight: 700;
        }

        .harvester-target {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(24, 34, 45, 0.18);
          border-radius: 12px;
          padding: 10px 12px;
          background: #fffdfa;
          color: #18222d;
          font-size: 14px;
          font-weight: 700;
        }

        .harvester-status,
        .harvester-count,
        .harvester-reposts,
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

        .harvester-button {
          border: 0;
          border-radius: 999px;
          padding: 12px 14px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 800;
        }

        .harvester-start {
          background: #0a66c2;
          color: #ffffff;
        }

        .harvester-stop {
          background: rgba(24, 34, 45, 0.12);
          color: #18222d;
        }

        .harvester-export {
          background: #0a66c2;
          color: #ffffff;
        }

        .harvester-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
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
          <div class="harvester-target-row">
            <label class="harvester-label">
              Target posts
              <input class="harvester-target" type="number" min="1" max="200" value="50" />
            </label>
            <button class="harvester-button harvester-start" type="button">Start</button>
          </div>
          <div class="harvester-actions">
            <button class="harvester-button harvester-stop" type="button">Stop</button>
            <button class="harvester-button harvester-export" type="button">Export JSON</button>
          </div>
          <p class="harvester-count">Posts identified: 0 / 50</p>
          <p class="harvester-reposts">Reposts identified: 0</p>
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
      targetInput: shadowRoot.querySelector(".harvester-target"),
      startButton: shadowRoot.querySelector(".harvester-start"),
      stopButton: shadowRoot.querySelector(".harvester-stop"),
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
    panel.targetInput.addEventListener("change", function (event) {
      void syncTargetCount(event.target.value);
    });
    panel.startButton.addEventListener("click", function () {
      void startCollection();
    });
    panel.stopButton.addEventListener("click", function () {
      void stopCollection();
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
    panel.targetInput.value = String(uiState.targetCount);
    panel.targetInput.disabled =
      uiState.runState === RUN_STATES.running ||
      uiState.runState === RUN_STATES.stopping;
    panel.startButton.disabled =
      uiState.runState === RUN_STATES.running ||
      uiState.runState === RUN_STATES.stopping ||
      uiState.runState === RUN_STATES.unavailable;
    panel.stopButton.disabled =
      uiState.runState !== RUN_STATES.running &&
      uiState.runState !== RUN_STATES.stopping;
    panel.count.textContent =
      "Posts identified: " + uiState.count + " / " + uiState.targetCount;
    panel.reposts.textContent = "Reposts identified: " + uiState.repostCount;
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
    if (!panel || !isExtensionContextAvailable()) {
      return;
    }

    panel.exportButton.disabled = true;
    panel.feedback.textContent = "Preparing JSON export...";

    try {
      const response = await safeSendMessage({
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

  async function syncTargetCount(value) {
    if (!isExtensionContextAvailable()) {
      return;
    }

    const targetCount = clampTargetCount(value);
    const response = await safeSendMessage({
      type: MESSAGE_TYPES.setTargetRequest,
      targetCount: targetCount,
    });

    if (!response?.ok) {
      panel.feedback.textContent = response?.error || "Failed to update target.";
      return;
    }

    panel.feedback.textContent = "Target updated to " + response.state.targetCount;
  }

  async function startCollection() {
    if (!isExtensionContextAvailable()) {
      return;
    }

    panel.feedback.textContent = "Starting crawler...";

    const response = await safeSendMessage({
      type: MESSAGE_TYPES.startRequest,
      targetCount: clampTargetCount(panel.targetInput.value),
    });

    if (!response?.ok) {
      panel.feedback.textContent = response?.error || "Failed to start crawler.";
      return;
    }

    panel.feedback.textContent = "Crawler started.";
  }

  async function stopCollection() {
    if (!isExtensionContextAvailable()) {
      return;
    }

    panel.feedback.textContent = "Stopping crawler...";

    const response = await safeSendMessage({
      type: MESSAGE_TYPES.stopRequest,
    });

    if (!response?.ok) {
      panel.feedback.textContent = response?.error || "Failed to stop crawler.";
      return;
    }

    panel.feedback.textContent = "Crawler stop requested.";
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
    await safeStorageLocalSet({
      [STORAGE_KEYS.panelPosition]: uiState.panelPosition,
      [STORAGE_KEYS.panelMinimized]: uiState.panelMinimized,
    });
  }

  function clampPanelPosition(position, options) {
    const isMinimized = Boolean(options?.minimized);
    const width = isMinimized ? 164 : 320;
    const height = isMinimized ? 52 : 320;
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
