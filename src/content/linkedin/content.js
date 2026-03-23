(function () {
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
  const PANEL_ROOT_ID = "linkedin-intelligence-harvester-root";
  const DEFAULT_PANEL_POSITION = { top: 96, right: 24 };
  const TARGET_COUNT_DEFAULT = 50;
  const TARGET_COUNT_MIN = 1;
  const TARGET_COUNT_MAX = 200;
  const ENRICHMENT_STATES = {
    idle: "idle",
    running: "running",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled",
  };
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
  const LONG_WAIT_MS = 20000;
  const STALLED_WAIT_LIMIT = 3;
  const ACTIVITY_LIMIT = 30;
  const TARGET_PRESETS = [25, 50, 100];
  const AI_QUEUE_PHASES = {
    idle: "idle",
    processing: "processing",
    backingOff: "backing-off",
    disabled: "disabled",
    configError: "config-error",
  };
  const AI_STATUS = {
    pending: "pending",
    interested: "interested",
    notInterested: "not_interested",
    unknown: "unknown",
  };

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
    exportRawRequest: "collector/export-raw-request",
    exportEnrichedRequest: "collector/export-enriched-request",
    profileExtractRequest: "collector/profile-extract-request",
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

  let processedElements = new WeakMap();
  const uiState = {
    count: 0,
    repostCount: 0,
    status: STATUS_TEXT.idle,
    runState: RUN_STATES.idle,
    targetCount: TARGET_COUNT_DEFAULT,
    noProgressCycles: 0,
    stalledWaitCount: 0,
    activityItems: [],
    enrichment: createEmptyEnrichmentState(),
    aiCounts: createEmptyAiCounts(),
    aiQueue: createEmptyAiQueueState(),
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
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      return handleRuntimeMessage(message, sender, sendResponse);
    });
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
    uiState.stalledWaitCount = response?.state?.stalledWaitCount || 0;
    uiState.enrichment = mergeEnrichmentState(response?.state?.enrichment);
    uiState.aiCounts = mergeAiCounts(response?.state?.aiCounts);
    uiState.aiQueue = mergeAiQueueState(response?.state?.aiQueue);
    uiState.panelPosition = clampPanelPosition(
      stored[STORAGE_KEYS.panelPosition] || DEFAULT_PANEL_POSITION,
      { minimized: stored[STORAGE_KEYS.panelMinimized] || false },
    );
    uiState.panelMinimized = Boolean(stored[STORAGE_KEYS.panelMinimized]);
    pushActivity(uiState.status);
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

  function handleRuntimeMessage(message, _sender, sendResponse) {
    if (message?.type === MESSAGE_TYPES.countUpdated) {
      if ((message.count || 0) > uiState.count) {
        pushActivity(
          "Captured " + ((message.count || 0) - uiState.count) + " new posts.",
        );
      }

      if ((message.repostCount || 0) > uiState.repostCount) {
        pushActivity(
          "Detected " + (message.repostCount || 0) + " reposts so far.",
        );
      }

      if ((message.stalledWaitCount || 0) > uiState.stalledWaitCount) {
        pushActivity(
          "Long wait " +
            (message.stalledWaitCount || 0) +
            " / " +
            STALLED_WAIT_LIMIT +
            " scheduled.",
        );
      }

      if (message.status && message.status !== uiState.status) {
        pushActivity(message.status);
      }

      uiState.count = message.count || 0;
      uiState.repostCount = message.repostCount || 0;
      uiState.status = message.status || STATUS_TEXT.idle;
      uiState.runState = message.runState || RUN_STATES.idle;
      uiState.targetCount = clampTargetCount(message.targetCount);
      uiState.noProgressCycles = message.noProgressCycles || 0;
      uiState.stalledWaitCount = message.stalledWaitCount || 0;
      uiState.enrichment = mergeEnrichmentState(message.enrichment);
      const nextAiCounts = mergeAiCounts(message.aiCounts);
      const nextAiQueue = mergeAiQueueState(message.aiQueue);

      appendAiActivity(nextAiCounts, nextAiQueue);
      uiState.aiCounts = nextAiCounts;
      uiState.aiQueue = nextAiQueue;

      if (
        uiState.enrichment.status === ENRICHMENT_STATES.running &&
        uiState.enrichment.lastMessage
      ) {
        pushActivity(uiState.enrichment.lastMessage);
      }
      renderPanel();
      return;
    }

    if (message?.type === MESSAGE_TYPES.profileExtractRequest) {
      sendResponse({
        ok: true,
        profile: extractProfileSignals(),
      });
      return true;
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
      return false;
    }

    if (message.action === "reset") {
      crawlShouldStop = true;
      crawlRunId += 1;
      processedElements = new WeakMap();
      uiState.count = 0;
      uiState.repostCount = 0;
      uiState.status = STATUS_TEXT.attached;
      uiState.runState = RUN_STATES.idle;
      uiState.noProgressCycles = 0;
      uiState.stalledWaitCount = 0;
      uiState.enrichment = mergeEnrichmentState(null);
      uiState.activityItems = ["Debug reset completed."];
      renderPanel();

      if (activeFeedContainer) {
        scheduleScan(activeFeedContainer);
      }
    }

    return false;
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

  function pushActivity(message) {
    if (!message) {
      return;
    }

    if (uiState.activityItems[0] === message) {
      return;
    }

    uiState.activityItems = [message, ...uiState.activityItems].slice(
      0,
      ACTIVITY_LIMIT,
    );
  }

  function createEmptyAiCounts() {
    return {
      pending: 0,
      interested: 0,
      not_interested: 0,
      unknown: 0,
    };
  }

  function createEmptyAiQueueState() {
    return {
      phase: AI_QUEUE_PHASES.idle,
      retryAfterUntil: null,
      lastRequestAt: null,
      lastError: null,
      pendingCount: 0,
    };
  }

  function mergeAiCounts(aiCounts) {
    return {
      ...createEmptyAiCounts(),
      ...(aiCounts || {}),
    };
  }

  function mergeAiQueueState(aiQueue) {
    return {
      ...createEmptyAiQueueState(),
      ...(aiQueue || {}),
    };
  }

  function appendAiActivity(nextAiCounts, nextAiQueue) {
    if (!nextAiQueue) {
      return;
    }

    if (
      nextAiQueue.phase === AI_QUEUE_PHASES.processing &&
      uiState.aiQueue.phase !== AI_QUEUE_PHASES.processing
    ) {
      pushActivity(
        "AI validation running for " + (nextAiQueue.pendingCount || 0) + " pending posts.",
      );
    }

    if (
      nextAiQueue.phase === AI_QUEUE_PHASES.backingOff &&
      (uiState.aiQueue.phase !== AI_QUEUE_PHASES.backingOff ||
        nextAiQueue.retryAfterUntil !== uiState.aiQueue.retryAfterUntil)
    ) {
      pushActivity(
        "AI validation backing off after rate limit. Pending: " +
          (nextAiQueue.pendingCount || 0) +
          ".",
      );
    }

    if (
      nextAiQueue.phase === AI_QUEUE_PHASES.configError &&
      nextAiQueue.lastError &&
      nextAiQueue.lastError !== uiState.aiQueue.lastError
    ) {
      pushActivity("AI config error: " + nextAiQueue.lastError);
    }

    if (
      nextAiQueue.phase === AI_QUEUE_PHASES.disabled &&
      uiState.aiQueue.phase !== AI_QUEUE_PHASES.disabled
    ) {
      pushActivity("AI validation disabled.");
    }

    if (
      nextAiQueue.phase === AI_QUEUE_PHASES.idle &&
      uiState.aiQueue.phase !== AI_QUEUE_PHASES.idle &&
      (nextAiCounts.pending || 0) === 0
    ) {
      pushActivity(
        "AI validation completed. interested: " +
          (nextAiCounts.interested || 0) +
          ", not_interested: " +
          (nextAiCounts.not_interested || 0) +
          ", unknown: " +
          (nextAiCounts.unknown || 0) +
          ".",
      );
    }

    if ((nextAiCounts.interested || 0) > (uiState.aiCounts.interested || 0)) {
      pushActivity("AI marked 1 post as interested.");
    }

    if (
      (nextAiCounts.not_interested || 0) >
      (uiState.aiCounts.not_interested || 0)
    ) {
      pushActivity("AI marked 1 post as not_interested.");
    }

    if ((nextAiCounts.unknown || 0) > (uiState.aiCounts.unknown || 0)) {
      pushActivity("AI left 1 post as unknown after retries.");
    }
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

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatRunState(runState) {
    switch (runState) {
      case RUN_STATES.running:
        return "Running";
      case RUN_STATES.stopping:
        return "Stopping";
      case RUN_STATES.completed:
        return "Complete";
      case RUN_STATES.unavailable:
        return "Offline";
      case RUN_STATES.stopped:
        return "Stopped";
      default:
        return "Idle";
    }
  }

  function formatEnrichmentStatus(status) {
    switch (status) {
      case ENRICHMENT_STATES.running:
        return "Running";
      case ENRICHMENT_STATES.completed:
        return "Ready";
      case ENRICHMENT_STATES.failed:
        return "Failed";
      case ENRICHMENT_STATES.cancelled:
        return "Cancelled";
      default:
        return "Idle";
    }
  }

  function formatAiQueuePhase(phase) {
    switch (phase) {
      case AI_QUEUE_PHASES.processing:
        return "Processing";
      case AI_QUEUE_PHASES.backingOff:
        return "Backing off";
      case AI_QUEUE_PHASES.disabled:
        return "Disabled";
      case AI_QUEUE_PHASES.configError:
        return "Config error";
      default:
        return "Idle";
    }
  }

  function formatAiSummary() {
    if (uiState.aiQueue.phase === AI_QUEUE_PHASES.disabled) {
      return "AI validation is disabled.";
    }

    if (uiState.aiQueue.phase === AI_QUEUE_PHASES.configError) {
      return uiState.aiQueue.lastError || "AI config needs attention.";
    }

    if (uiState.aiQueue.phase === AI_QUEUE_PHASES.backingOff) {
      return (
        "Waiting before retry. " +
        formatRetryCountdown(uiState.aiQueue.retryAfterUntil)
      );
    }

    if (uiState.aiQueue.phase === AI_QUEUE_PHASES.processing) {
      return (
        "Validating posts now. Pending: " +
        (uiState.aiCounts.pending || 0) +
        "."
      );
    }

    if ((uiState.aiCounts.pending || 0) === 0 && hasAiResults()) {
      return "AI validation complete for current batch.";
    }

    return "No AI validation running.";
  }

  function formatRetryCountdown(retryAfterUntil) {
    if (!retryAfterUntil) {
      return "Retry time pending.";
    }

    const waitMs = new Date(retryAfterUntil).getTime() - Date.now();

    if (waitMs <= 0) {
      return "Retrying shortly.";
    }

    const totalSeconds = Math.ceil(waitMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes <= 0) {
      return "Retry in " + seconds + "s.";
    }

    return "Retry in " + minutes + "m " + String(seconds).padStart(2, "0") + "s.";
  }

  function getAiDoneCount() {
    return (
      (uiState.aiCounts.interested || 0) +
      (uiState.aiCounts.not_interested || 0) +
      (uiState.aiCounts.unknown || 0)
    );
  }

  function hasAiResults() {
    return getAiDoneCount() > 0;
  }

  function getEnrichedButtonLabel() {
    if (uiState.enrichment.status === ENRICHMENT_STATES.running) {
      return "Enriching...";
    }

    if (uiState.enrichment.readyForDownload) {
      return uiState.aiCounts.pending > 0
        ? "Download enriched (AI pending)"
        : "Download enriched";
    }

    return "Export enriched";
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
    cleaned = cleaned.replace(/â€¢/g, " ");
    cleaned = cleaned.replace(/[•·]+/g, " ");
    cleaned = cleaned.replace(/â€¢|Â·/g, " ");
    cleaned = cleaned.replace(/\s+[•·]+\s*$/g, " ");
    cleaned = normalizeWhitespace(cleaned);

    return cleaned || null;
  }

  function hasRelationshipMarker(text) {
    const normalized = normalizeWhitespace(text || "");

    return RELATIONSHIP_MARKERS.some(function (marker) {
      return normalized.includes(marker);
    });
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

  function isSuggestedPost(postElement) {
    const paragraphs = Array.from(postElement.querySelectorAll("p"));

    return paragraphs.some(function (paragraph) {
      const text = normalizeWhitespace(paragraph.textContent || "");

      return SUGGESTED_LABELS.some(function (label) {
        return text === label;
      });
    });
  }

  function findRelationshipSpan(postElement) {
    const spans = Array.from(postElement.querySelectorAll("span, p"));

    return (
      spans.find(function (span) {
        const text = normalizeWhitespace(span.textContent || "");

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

  function extractAuthor(postElement) {
    const labelledElements = Array.from(postElement.querySelectorAll("[aria-label]"));

    for (const element of labelledElements) {
      const label = normalizeWhitespace(element.getAttribute("aria-label") || "");

      if (!hasRelationshipMarker(label)) {
        continue;
      }

      const authorFromLabel = removeRelationshipMarker(label);

      if (authorFromLabel) {
        return authorFromLabel;
      }
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

  function createEmptyEnrichmentState() {
    return {
      status: ENRICHMENT_STATES.idle,
      totalPosts: 0,
      processedPosts: 0,
      totalAuthors: 0,
      processedAuthors: 0,
      currentAuthor: null,
      currentPostIndex: 0,
      lastMessage: null,
      readyForDownload: false,
    };
  }

  function mergeEnrichmentState(enrichment) {
    return Object.assign(createEmptyEnrichmentState(), enrichment || {});
  }

  function extractAuthorProfileUrl(postElement, author) {
    const anchors = Array.from(
      postElement.querySelectorAll('a[href*="/in/"], a[href*="/company/"]'),
    );
    const normalizedAuthor = normalizeWhitespace(author || "").toLowerCase();

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href");
      const label = normalizeWhitespace(
        [anchor.textContent || "", anchor.getAttribute("aria-label") || ""].join(
          " ",
        ),
      ).toLowerCase();

      if (!href) {
        continue;
      }

      if (normalizedAuthor && label.includes(normalizedAuthor)) {
        try {
          return new URL(href, window.location.origin).toString();
        } catch {
          return href;
        }
      }
    }

    const fallbackHref = anchors[0]?.getAttribute("href");

    if (!fallbackHref) {
      return null;
    }

    try {
      return new URL(fallbackHref, window.location.origin).toString();
    } catch {
      return fallbackHref;
    }
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

  function findPostOverflowButton(postElement) {
    return postElement?.querySelector(OVERFLOW_BUTTON_SELECTOR) || null;
  }

  function findFloatingPostMenu() {
    return document.querySelector(FLOATING_MENU_SELECTOR);
  }

  function findCopyLinkMenuItem(menuElement) {
    return (
      Array.from(menuElement?.querySelectorAll(MENU_ITEM_SELECTOR) || []).find((item) =>
        normalizeWhitespace(item.textContent || "")
          .toLowerCase()
          .includes("copy link to post"),
      ) || null
    );
  }

  async function resolvePostPermalink(postElement, seenLinks = new Set()) {
    const overflowButton = findPostOverflowButton(postElement);

    if (!overflowButton) {
      logPage("permalink-overflow-button-missing");
      return null;
    }

    logPage("permalink-menu-opening");
    overflowButton.click();

    const menuElement = await waitForElement(findFloatingPostMenu, 1200);

    if (!menuElement) {
      logPage("permalink-menu-timeout");
      return null;
    }

    logPage("permalink-menu-found");
    const copyLinkItem = findCopyLinkMenuItem(menuElement);

    if (!copyLinkItem) {
      logPage("permalink-copy-link-item-missing");
      closeFloatingMenu(overflowButton);
      return null;
    }

    const clipboardBeforeClick = normalizeCapturedPermalink(
      await readClipboardPermalink(0),
    );

    logPage("permalink-copy-link-click", {
      previousClipboardLink: clipboardBeforeClick,
    });
    copyLinkItem.click();
    const clipboardUrl = await waitForFreshPermalink(clipboardBeforeClick, {
      timeoutMs: 2200,
      pollMs: 100,
    });
    closeFloatingMenu(overflowButton);

    if (clipboardUrl) {
      if (seenLinks.has(clipboardUrl)) {
        logPage("permalink-seen-link-detected", {
          candidate: clipboardUrl,
          seenCount: seenLinks.size,
        });
        return null;
      }

      logPage("permalink-found-in-clipboard", { link: clipboardUrl });
      return clipboardUrl;
    }

    logPage("permalink-resolution-failed");
    return null;
  }

  async function readClipboardPermalink(settleDelayMs = 150) {
    if (!navigator.clipboard?.readText) {
      logPage("permalink-clipboard-unavailable");
      return null;
    }

    if (settleDelayMs > 0) {
      await sleep(settleDelayMs);
    }

    try {
      const text = (await navigator.clipboard.readText()).trim();
      return text;
    } catch (error) {
      logPage("permalink-clipboard-read-failed", { message: error.message });
    }

    return null;
  }

  function closeFloatingMenu(overflowButton) {
    overflowButton?.click();
  }

  function normalizeCapturedPermalink(value) {
    const normalized = String(value || "").trim();

    if (!normalized) {
      return null;
    }

    if (!/^https:\/\/www\.linkedin\.com\//i.test(normalized)) {
      return null;
    }

    return normalized;
  }

  async function waitForFreshPermalink(previousClipboardLink, options = {}) {
    const timeoutMs = Math.max(200, options.timeoutMs || 2000);
    const pollMs = Math.max(50, options.pollMs || 100);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const candidate = normalizeCapturedPermalink(
        await readClipboardPermalink(0),
      );

      if (candidate && candidate !== previousClipboardLink) {
        return candidate;
      }

      await sleep(pollMs);
    }

    const fallbackCandidate = normalizeCapturedPermalink(
      await readClipboardPermalink(0),
    );

    if (fallbackCandidate && fallbackCandidate !== previousClipboardLink) {
      return fallbackCandidate;
    }

    logPage("permalink-clipboard-did-not-change", {
      previousClipboardLink: previousClipboardLink,
      timeoutMs: timeoutMs,
    });
    return null;
  }

  async function waitForElement(getElement, timeoutMs) {
    const existing = getElement();

    if (existing) {
      return existing;
    }

    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await sleep(50);
      const element = getElement();

      if (element) {
        return element;
      }
    }

    return null;
  }

  function extractProfileSignals() {
    const roleSelectors = [
      ".text-body-medium.break-words",
      ".pv-text-details__left-panel .text-body-medium",
      "main section .text-body-medium",
    ];
    let role = null;

    for (const selector of roleSelectors) {
      const text = normalizeWhitespace(
        document.querySelector(selector)?.textContent || "",
      );

      if (text) {
        role = text;
        break;
      }
    }

    const pageText = normalizeWhitespace(document.body?.textContent || "");
    const followersMatch = pageText.match(
      /(\d+(?:[.,]\d+)?)\s*([kKmM])?\+?\s*(followers|seguidores)\b/i,
    );
    let followers = null;

    if (followersMatch) {
      followers =
        followersMatch[1].replace(",", "") + (followersMatch[2] || "");
    }

    return {
      role: role || null,
      followers: followers || null,
    };
  }

  async function scanFeedPosts(feedContainer) {
    const acceptedItems = [];
    const skippedItems = [];
    const seenLinks = new Set();

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

      if (isSuggestedPost(postElement)) {
        skippedItems.push("suggested");
        continue;
      }

      const author = extractAuthor(postElement);

      if (!author) {
        skippedItems.push("missing-author");
        continue;
      }

      const repostMetadata = extractRepostMetadata(postElement);

      const item = buildNormalizedItem(
        postElement,
        author,
        repostMetadata,
        new Date(),
      );
      item.link = await resolvePostPermalink(postElement, seenLinks);
      if (item.link) {
        seenLinks.add(item.link);
      }
      acceptedItems.push(item);
    }

    return { acceptedItems: acceptedItems, skippedItems: skippedItems };
  }

  function summarizeSkippedReasons(skippedItems) {
    return skippedItems.reduce(function (summary, reason) {
      summary[reason] = (summary[reason] || 0) + 1;
      return summary;
    }, {});
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
      pushActivity(STATUS_TEXT.unavailable);
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
    pushActivity(STATUS_TEXT.attached);
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
    const scanResult = await scanFeedPosts(feedContainer);
    const skippedBreakdown = summarizeSkippedReasons(scanResult.skippedItems);

    logPage("scan complete", {
      totalListItems: totalListItems,
      accepted: scanResult.acceptedItems.length,
      skipped: scanResult.skippedItems.length,
      skippedBreakdown: skippedBreakdown,
    });

    await logToServiceWorker("scan-results", {
      totalListItems: totalListItems,
      accepted: scanResult.acceptedItems.length,
      skipped: scanResult.skippedItems.length,
      skippedBreakdown: skippedBreakdown,
    });

    for (const item of scanResult.acceptedItems) {
      const loggable = Object.assign({}, item);
      delete loggable.fingerprint;
      logPage("item found", loggable);
    }

    for (const reason of Object.keys(skippedBreakdown)) {
      logPage("skipped items", {
        reason: reason,
        count: skippedBreakdown[reason],
      });
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
          font-family:
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            sans-serif;
        }

        .harvester-shell {
          position: fixed;
          display: grid;
          gap: 12px;
          width: 320px;
          max-height: calc(100vh - 32px);
          padding: 14px;
          background: #ffffff;
          color: #111827;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 12px;
          box-shadow:
            0 0 0 1px rgba(0, 0, 0, 0.05),
            0 10px 15px -3px rgba(0, 0, 0, 0.1),
            0 4px 6px -2px rgba(0, 0, 0, 0.05);
          pointer-events: auto;
          font-family:
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            sans-serif;
        }

        .harvester-shell[data-state="minimized"] {
          width: 164px;
          border-radius: 12px;
          padding: 10px 12px;
        }

        .harvester-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          cursor: grab;
          user-select: none;
        }

        .harvester-header:active {
          cursor: grabbing;
        }

        .harvester-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .harvester-eyebrow {
          margin: 0 0 4px;
          color: #6b7280;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .harvester-title {
          margin: 0;
          color: #111827;
          font-size: 28px;
          line-height: 0.95;
          font-weight: 700;
          letter-spacing: -0.04em;
        }

        .harvester-status-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 28px;
          padding: 0 10px;
          border-radius: 8px;
          background: #f3f4f6;
          color: #374151;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          border: 1px solid rgba(0, 0, 0, 0.08);
          position: relative;
        }

        .harvester-status-badge::before {
          content: "";
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #9ca3af;
          box-shadow: none;
          flex: 0 0 auto;
        }

        .harvester-status-badge[data-run-state="running"] {
          background: rgba(0, 102, 255, 0.1);
          color: #0066ff;
        }

        .harvester-status-badge[data-run-state="running"]::before {
          background: #22c55e;
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.42);
          animation: harvester-status-ping 1.8s ease-out infinite;
        }

        .harvester-status-badge[data-run-state="stopping"] {
          background: rgba(245, 158, 11, 0.12);
          color: #b45309;
        }

        .harvester-status-badge[data-run-state="completed"] {
          background: rgba(16, 185, 129, 0.12);
          color: #047857;
        }

        .harvester-status-badge[data-run-state="completed"]::before {
          background: #0066ff;
        }

        .harvester-status-badge[data-run-state="unavailable"] {
          background: rgba(239, 68, 68, 0.1);
          color: #b91c1c;
        }

        .harvester-status-badge[data-run-state="unavailable"]::before {
          background: #9ca3af;
        }

        @keyframes harvester-status-ping {
          0% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.42);
          }

          70% {
            box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
          }

          100% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
          }
        }

        .harvester-minimize {
          border: 0;
          border-radius: 14px;
          min-width: 28px;
          height: 28px;
          background: #f3f4f6;
          color: #374151;
          font-size: 18px;
          line-height: 1;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid rgba(0, 0, 0, 0.08);
        }

        .harvester-body {
          display: grid;
          gap: 10px;
          max-height: calc(100vh - 132px);
          overflow-y: auto;
          padding-right: 4px;
        }

        .harvester-hero,
        .harvester-activity {
          display: grid;
          gap: 6px;
          padding: 10px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #ffffff;
        }

        .harvester-hero-label,
        .harvester-activity-label,
        .harvester-metric-label {
          color: #6b7280;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .harvester-hero-metric {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          line-height: 1;
        }

        .harvester-hero-count,
        .harvester-hero-target,
        .harvester-reposts,
        .harvester-mode,
        .harvester-wait-count,
        .harvester-activity-log li,
        .harvester-target {
          font-family:
            "JetBrains Mono",
            "SF Mono",
            "Roboto Mono",
            Menlo,
            Monaco,
            Consolas,
            monospace;
          font-variant-numeric: tabular-nums;
        }

        .harvester-hero-count,
        .harvester-hero-target {
          font-weight: 700;
          letter-spacing: -0.05em;
        }

        .harvester-hero-count {
          font-size: 44px;
        }

        .harvester-hero-target {
          font-size: 24px;
          color: #9ca3af;
          padding-bottom: 4px;
        }

        .harvester-hero-separator {
          font-size: 24px;
          color: #9ca3af;
          padding-bottom: 4px;
        }

        .harvester-status {
          margin: 0;
          color: #4b5563;
          font-size: 15px;
          line-height: 1.5;
        }

        .harvester-target-row,
        .harvester-actions,
        .harvester-presets,
        .harvester-metrics {
          display: grid;
          gap: 8px;
        }

        .harvester-presets,
        .harvester-metrics {
          grid-template-columns: repeat(3, 1fr);
        }

        .harvester-metric-card {
          display: grid;
          gap: 4px;
          padding: 10px;
          border-radius: 8px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
        }

        .harvester-metric-value,
        .harvester-reposts,
        .harvester-mode,
        .harvester-wait-count {
          margin: 0;
          color: #111827;
          font-size: 18px;
          line-height: 1.1;
          letter-spacing: -0.03em;
          font-weight: 500;
        }

        .harvester-preset {
          border: 0;
          border-radius: 8px;
          padding: 10px 14px;
          background: #f3f4f6;
          color: #111827;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          border: 1px solid rgba(0, 0, 0, 0.08);
          transition:
            background-color 120ms ease,
            color 120ms ease,
            border-color 120ms ease;
        }

        .harvester-preset.is-active {
          background: #0066ff;
          color: #ffffff;
          border-color: #0066ff;
        }

        .harvester-target-row {
          grid-template-columns: 1fr 112px;
          align-items: end;
        }

        .harvester-label {
          display: grid;
          gap: 4px;
          margin: 0;
          color: #6b7280;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .harvester-target {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 8px;
          padding: 8px 14px;
          min-height: 34px;
          background: #ffffff;
          color: #111827;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.04em;
        }

        .harvester-button {
          border: 0;
          border-radius: 8px;
          min-height: 34px;
          padding: 8px 14px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition:
            background-color 120ms ease,
            color 120ms ease,
            border-color 120ms ease;
          border: 1px solid rgba(0, 0, 0, 0.08);
        }

        .harvester-start {
          background: #0066ff;
          color: #ffffff;
          border-color: #0066ff;
        }

        .harvester-stop {
          background: #f3f4f6;
          color: #111827;
        }

        .harvester-export-enriched {
          background: #0066ff;
          color: #ffffff;
          border-color: #0066ff;
        }

        .harvester-export-raw {
          background: #f3f4f6;
          color: #111827;
        }

        .harvester-button:disabled,
        .harvester-preset:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .harvester-button:not(:disabled):hover,
        .harvester-preset:not(:disabled):hover,
        .harvester-minimize:hover {
          filter: brightness(0.95);
        }

        .harvester-feedback {
          color: #43576b;
          min-height: 20px;
        }

        .harvester-enrichment-grid,
        .harvester-ai-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 12px;
          align-items: center;
        }

        .harvester-enrichment-grid strong,
        .harvester-ai-grid strong {
          color: #111827;
          font-size: 12px;
          line-height: 1.3;
          font-weight: 600;
        }

        .harvester-enrichment-status,
        .harvester-ai-status {
          color: #0066ff;
        }

        .harvester-feedback-copy {
          margin: 0;
          color: #4b5563;
          font-size: 11px;
          line-height: 1.35;
        }

        .harvester-activity-log {
          display: grid;
          gap: 6px;
          margin: 0;
          padding: 0;
          list-style: none;
          max-height: 74px;
          overflow-y: auto;
        }

        .harvester-activity-log li {
          display: grid;
          grid-template-columns: 6px 1fr;
          align-items: start;
          gap: 6px;
          color: #1f2937;
          font-size: 11px;
          line-height: 1.35;
          font-weight: 450;
        }

        .harvester-activity-log li::before {
          content: "";
          width: 6px;
          height: 6px;
          align-self: start;
          margin-top: calc((1em * 1.5 - 6px) / 2);
          border-radius: 999px;
          background: #0066ff;
        }

        .harvester-chip {
          display: none;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          border: 0;
          border-radius: 8px;
          padding: 12px 14px;
          background: #ffffff;
          color: #111827;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.02em;
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow:
            0 0 0 1px rgba(0, 0, 0, 0.05),
            0 10px 15px -3px rgba(0, 0, 0, 0.1),
            0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }

        .harvester-chip-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .harvester-chip-label::before {
          content: "";
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #0066ff;
        }

        .harvester-chip-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 28px;
          padding: 2px 8px;
          border-radius: 8px;
          background: #f3f4f6;
          color: #111827;
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
            <h2 class="harvester-title">Harvester Console</h2>
          </div>
          <div class="harvester-header-actions">
            <span class="harvester-status-badge" data-run-state="idle">Idle</span>
            <button class="harvester-minimize" type="button" aria-label="Minimize panel">-</button>
          </div>
        </header>
        <div class="harvester-body">
          <section class="harvester-hero">
            <p class="harvester-hero-label">Accepted posts</p>
            <div class="harvester-hero-metric">
              <span class="harvester-hero-count">0</span>
              <span class="harvester-hero-separator">/</span>
              <span class="harvester-hero-target">50</span>
            </div>
            <p class="harvester-status">Waiting for LinkedIn feed...</p>
          </section>
          <div class="harvester-metrics">
            <article class="harvester-metric-card">
              <span class="harvester-metric-label">Reposts</span>
              <strong class="harvester-reposts">0</strong>
            </article>
            <article class="harvester-metric-card">
              <span class="harvester-metric-label">Mode</span>
              <strong class="harvester-mode">Idle</strong>
            </article>
            <article class="harvester-metric-card">
              <span class="harvester-metric-label">Long wait</span>
              <strong class="harvester-wait-count">0 / 3</strong>
            </article>
          </div>
          <div class="harvester-presets">
            <button class="harvester-preset" type="button" data-target-preset="25">25</button>
            <button class="harvester-preset" type="button" data-target-preset="50">50</button>
            <button class="harvester-preset" type="button" data-target-preset="100">100</button>
          </div>
          <div class="harvester-target-row">
            <label class="harvester-label">
              Target posts
              <input class="harvester-target" type="number" min="1" max="200" value="50" />
            </label>
            <button class="harvester-button harvester-start" type="button">Start</button>
          </div>
          <div class="harvester-actions">
            <button class="harvester-button harvester-stop" type="button">Stop</button>
            <button class="harvester-button harvester-export-raw" type="button">Export raw</button>
            <button class="harvester-button harvester-export-enriched" type="button">Export enriched</button>
          </div>
          <section class="harvester-activity">
            <p class="harvester-activity-label">Enrichment</p>
            <div class="harvester-enrichment-grid">
              <strong class="harvester-enrichment-status">Idle</strong>
              <strong class="harvester-enrichment-posts">Posts 0 / 0</strong>
              <strong class="harvester-enrichment-authors">Authors 0 / 0</strong>
            </div>
            <p class="harvester-feedback-copy">No enrichment in progress.</p>
          </section>
          <section class="harvester-activity">
            <p class="harvester-activity-label">AI Validation</p>
            <div class="harvester-ai-grid">
              <strong class="harvester-ai-status">Idle</strong>
              <strong class="harvester-ai-pending">Pending 0</strong>
              <strong class="harvester-ai-done">Done 0</strong>
              <strong class="harvester-ai-results">Interested 0 / Not 0 / Unknown 0</strong>
            </div>
            <p class="harvester-ai-copy harvester-feedback-copy">No AI validation running.</p>
            <p class="harvester-ai-error harvester-feedback-copy">Last error: none</p>
          </section>
          <section class="harvester-activity">
            <p class="harvester-activity-label">Activity</p>
            <ul class="harvester-activity-log">
              <li>Waiting for LinkedIn feed...</li>
            </ul>
          </section>
          <p class="harvester-feedback" aria-live="polite" hidden></p>
        </div>
        <button class="harvester-chip" type="button" hidden>
          <span class="harvester-chip-label">Harvester</span>
          <span class="harvester-chip-count">0</span>
        </button>
      </section>
    `;

    document.documentElement.appendChild(host);

    panel = {
      host: host,
      shadowRoot: shadowRoot,
      shell: shadowRoot.querySelector(".harvester-shell"),
      header: shadowRoot.querySelector(".harvester-header"),
      statusBadge: shadowRoot.querySelector(".harvester-status-badge"),
      minimizeButton: shadowRoot.querySelector(".harvester-minimize"),
      status: shadowRoot.querySelector(".harvester-status"),
      heroCount: shadowRoot.querySelector(".harvester-hero-count"),
      heroTarget: shadowRoot.querySelector(".harvester-hero-target"),
      targetInput: shadowRoot.querySelector(".harvester-target"),
      startButton: shadowRoot.querySelector(".harvester-start"),
      stopButton: shadowRoot.querySelector(".harvester-stop"),
      reposts: shadowRoot.querySelector(".harvester-reposts"),
      mode: shadowRoot.querySelector(".harvester-mode"),
      waitCount: shadowRoot.querySelector(".harvester-wait-count"),
      exportRawButton: shadowRoot.querySelector(".harvester-export-raw"),
      exportEnrichedButton: shadowRoot.querySelector(".harvester-export-enriched"),
      enrichmentStatus: shadowRoot.querySelector(".harvester-enrichment-status"),
      enrichmentPosts: shadowRoot.querySelector(".harvester-enrichment-posts"),
      enrichmentAuthors: shadowRoot.querySelector(".harvester-enrichment-authors"),
      enrichmentCopy: shadowRoot.querySelector(".harvester-feedback-copy"),
      aiStatus: shadowRoot.querySelector(".harvester-ai-status"),
      aiPending: shadowRoot.querySelector(".harvester-ai-pending"),
      aiDone: shadowRoot.querySelector(".harvester-ai-done"),
      aiResults: shadowRoot.querySelector(".harvester-ai-results"),
      aiCopy: shadowRoot.querySelector(".harvester-ai-copy"),
      aiError: shadowRoot.querySelector(".harvester-ai-error"),
      feedback: shadowRoot.querySelector(".harvester-feedback"),
      activityLog: shadowRoot.querySelector(".harvester-activity-log"),
      chip: shadowRoot.querySelector(".harvester-chip"),
      presetButtons: Array.from(shadowRoot.querySelectorAll(".harvester-preset")),
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
    panel.presetButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        void syncTargetCount(button.dataset.targetPreset, {
          logMessage:
            "Preset target " + clampTargetCount(button.dataset.targetPreset) + " applied.",
        });
      });
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
    panel.exportRawButton.addEventListener("click", function () {
      void exportCurrentBatch("raw");
    });
    panel.exportEnrichedButton.addEventListener("click", function () {
      void exportCurrentBatch("enriched");
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
    panel.statusBadge.textContent = formatRunState(uiState.runState);
    panel.statusBadge.dataset.runState = uiState.runState;
    panel.targetInput.value = String(uiState.targetCount);
    panel.targetInput.disabled =
      uiState.runState === RUN_STATES.running ||
      uiState.runState === RUN_STATES.stopping;
    panel.presetButtons.forEach(function (button) {
      const preset = clampTargetCount(button.dataset.targetPreset);
      button.classList.toggle("is-active", preset === uiState.targetCount);
      button.disabled =
        uiState.runState === RUN_STATES.running ||
        uiState.runState === RUN_STATES.stopping;
    });
    panel.startButton.disabled =
      uiState.runState === RUN_STATES.running ||
      uiState.runState === RUN_STATES.stopping ||
      uiState.runState === RUN_STATES.unavailable;
    panel.stopButton.disabled =
      uiState.runState !== RUN_STATES.running &&
      uiState.runState !== RUN_STATES.stopping;
    panel.exportRawButton.disabled = uiState.runState === RUN_STATES.unavailable;
    panel.exportEnrichedButton.disabled =
      uiState.runState === RUN_STATES.running ||
      uiState.runState === RUN_STATES.stopping ||
      uiState.runState === RUN_STATES.unavailable ||
      uiState.enrichment.status === ENRICHMENT_STATES.running;
    panel.exportEnrichedButton.textContent = getEnrichedButtonLabel();
    panel.heroCount.textContent = String(uiState.count);
    panel.heroTarget.textContent = String(uiState.targetCount);
    panel.reposts.textContent = String(uiState.repostCount);
    panel.mode.textContent = formatRunState(uiState.runState);
    panel.waitCount.textContent =
      uiState.stalledWaitCount + " / " + STALLED_WAIT_LIMIT;
    panel.enrichmentStatus.textContent = formatEnrichmentStatus(
      uiState.enrichment.status,
    );
    panel.enrichmentPosts.textContent =
      "Posts " +
      uiState.enrichment.processedPosts +
      " / " +
      uiState.enrichment.totalPosts;
    panel.enrichmentAuthors.textContent =
      "Authors " +
      uiState.enrichment.processedAuthors +
      " / " +
      uiState.enrichment.totalAuthors;
    panel.enrichmentCopy.textContent =
      uiState.enrichment.lastMessage || "No enrichment in progress.";
    panel.aiStatus.textContent = formatAiQueuePhase(uiState.aiQueue.phase);
    panel.aiPending.textContent = "Pending " + (uiState.aiCounts.pending || 0);
    panel.aiDone.textContent = "Done " + getAiDoneCount();
    panel.aiResults.textContent =
      "Interested " +
      (uiState.aiCounts.interested || 0) +
      " / Not " +
      (uiState.aiCounts.not_interested || 0) +
      " / Unknown " +
      (uiState.aiCounts.unknown || 0);
    panel.aiCopy.textContent = formatAiSummary();
    panel.aiError.textContent = uiState.aiQueue.lastError
      ? "Last error: " + uiState.aiQueue.lastError
      : "Last error: none";
    panel.activityLog.innerHTML = uiState.activityItems
      .map(function (item) {
        return "<li>" + escapeHtml(item) + "</li>";
      })
      .join("");
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

  async function exportCurrentBatch(mode) {
    if (!panel || !isExtensionContextAvailable()) {
      return;
    }

    const isEnriched = mode === "enriched";
    const button = isEnriched ? panel.exportEnrichedButton : panel.exportRawButton;
    button.disabled = true;
    pushActivity(isEnriched ? "Enriched export requested." : "Raw export requested.");

    try {
      const response = await safeSendMessage({
        type: isEnriched
          ? MESSAGE_TYPES.exportEnrichedRequest
          : MESSAGE_TYPES.exportRawRequest,
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Export failed");
      }

      if (response?.filename) {
        pushActivity("Downloaded " + response.filename);
      } else if (isEnriched) {
        pushActivity("Author enrichment started.");
      }
    } catch (error) {
      pushActivity(error.message);
    } finally {
      button.disabled = false;
      renderPanel();
    }
  }

  async function syncTargetCount(value, options) {
    if (!isExtensionContextAvailable()) {
      return;
    }

    const targetCount = clampTargetCount(value);
    const response = await safeSendMessage({
      type: MESSAGE_TYPES.setTargetRequest,
      targetCount: targetCount,
    });

    if (!response?.ok) {
      pushActivity(response?.error || "Failed to update target.");
      renderPanel();
      return;
    }

    pushActivity(
      options?.logMessage ||
        "Target updated to " + response.state.targetCount + ".",
    );
    renderPanel();
  }

  async function startCollection() {
    if (!isExtensionContextAvailable()) {
      return;
    }

    pushActivity("Start requested.");
    renderPanel();

    const response = await safeSendMessage({
      type: MESSAGE_TYPES.startRequest,
      targetCount: clampTargetCount(panel.targetInput.value),
    });

    if (!response?.ok) {
      pushActivity(response?.error || "Failed to start crawler.");
      renderPanel();
      return;
    }

    pushActivity("Crawler started.");
    renderPanel();
  }

  async function stopCollection() {
    if (!isExtensionContextAvailable()) {
      return;
    }

    pushActivity("Stop requested.");
    renderPanel();

    const response = await safeSendMessage({
      type: MESSAGE_TYPES.stopRequest,
    });

    if (!response?.ok) {
      pushActivity(response?.error || "Failed to stop crawler.");
      renderPanel();
      return;
    }

    pushActivity("Crawler stop requested.");
    renderPanel();
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
    const height = isMinimized ? 52 : 430;
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
