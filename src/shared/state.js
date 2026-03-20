import {
  ENRICHMENT_STATES,
  RUN_STATES,
  STATUS_TEXT,
  TARGET_COUNT_DEFAULT,
} from "./constants.js";
import {
  clampTargetCount,
  getFeedState,
  getProgressState,
  getStartState,
  getStoppedState,
} from "./crawler.js";

const tabStates = new Map();

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

function createEmptyState() {
  return {
    itemsByFingerprint: new Map(),
    enrichedItems: [],
    status: STATUS_TEXT.idle,
    runState: RUN_STATES.idle,
    targetCount: TARGET_COUNT_DEFAULT,
    noProgressCycles: 0,
    stalledWaitCount: 0,
    lastReason: null,
    enrichment: createEmptyEnrichmentState(),
  };
}

function getOrCreateTabState(tabId) {
  if (!tabStates.has(tabId)) {
    tabStates.set(tabId, createEmptyState());
  }

  return tabStates.get(tabId);
}

function buildTabStorageKey(tabId) {
  return `collector.tab.${tabId}`;
}

function buildFallbackFingerprint(item) {
  if (!item?.author || !item?.extracted_at) {
    return null;
  }

  return `${item.author.toLowerCase()}::${item.extracted_at}`;
}

export function getSerializableState(tabId) {
  const tabState = getOrCreateTabState(tabId);
  const items = Array.from(tabState.itemsByFingerprint.values()).map(
    ({ fingerprint, ...item }) => item,
  );

  return {
    items,
    count: tabState.itemsByFingerprint.size,
    repostCount: items.filter((item) => item.is_repost).length,
    status: tabState.status,
    runState: tabState.runState,
    targetCount: tabState.targetCount,
    noProgressCycles: tabState.noProgressCycles,
    stalledWaitCount: tabState.stalledWaitCount,
    lastReason: tabState.lastReason,
    enrichedItems: tabState.enrichedItems.map(({ fingerprint, ...item }) => item),
    enrichment: { ...tabState.enrichment },
  };
}

export function markStatus(tabId, status) {
  const tabState = getOrCreateTabState(tabId);
  tabState.status = status;
  return persistState(tabId);
}

export function setTargetCount(tabId, targetCount) {
  const tabState = getOrCreateTabState(tabId);
  tabState.targetCount = clampTargetCount(targetCount);
  return persistState(tabId);
}

export function markFeedReady(tabId, feedFound) {
  const tabState = getOrCreateTabState(tabId);
  const nextState = getFeedState(tabState.runState, feedFound);

  if (nextState) {
    tabState.runState = nextState.runState;
    tabState.status = nextState.status;
    tabState.noProgressCycles = 0;
    tabState.stalledWaitCount = 0;
    tabState.lastReason = feedFound ? null : "feed-unavailable";
  }

  return persistState(tabId);
}

export function startCrawler(tabId, targetCount) {
  const tabState = getOrCreateTabState(tabId);
  Object.assign(tabState, getStartState(targetCount));
  resetEnrichmentState(tabState);
  return persistState(tabId);
}

export function requestStopCrawler(tabId) {
  const tabState = getOrCreateTabState(tabId);

  if (tabState.runState === RUN_STATES.running) {
    tabState.runState = RUN_STATES.stopping;
    tabState.status = STATUS_TEXT.stopping;
    tabState.lastReason = "user";
  }

  return persistState(tabId);
}

export function finalizeStopCrawler(tabId, reason = "user") {
  const tabState = getOrCreateTabState(tabId);
  Object.assign(tabState, getStoppedState(reason));
  return persistState(tabId);
}

export function applyCrawlerProgress(
  tabId,
  { addedCount = 0, noProgressLimit, stalledWaitLimit } = {},
) {
  const tabState = getOrCreateTabState(tabId);
  const totalCount = tabState.itemsByFingerprint.size;
  const progressState = getProgressState(tabState, {
    addedCount,
    totalCount,
    noProgressLimit,
    stalledWaitLimit,
  });

  tabState.runState = progressState.runState;
  tabState.status = progressState.status;
  tabState.noProgressCycles = progressState.noProgressCycles;
  tabState.stalledWaitCount = progressState.stalledWaitCount;
  tabState.lastReason = progressState.lastReason;

  return persistState(tabId).then((state) => ({
    state,
    shouldStop: progressState.shouldStop,
    shouldLongWait: progressState.shouldLongWait,
    longWaitMs: progressState.longWaitMs,
    stopReason: progressState.stopReason,
  }));
}

export function mergeNewItems(tabId, items) {
  const tabState = getOrCreateTabState(tabId);
  let addedCount = 0;

  for (const item of items) {
    if (!item?.fingerprint) {
      continue;
    }

    if (tabState.itemsByFingerprint.has(item.fingerprint)) {
      continue;
    }

    tabState.itemsByFingerprint.set(item.fingerprint, item);
    addedCount += 1;
  }

  if (addedCount > 0) {
    resetEnrichmentState(tabState);
  }

  return {
    addedCount,
    state: getSerializableState(tabId),
  };
}

export function startEnrichment(
  tabId,
  { totalPosts = 0, totalAuthors = 0, lastMessage = null } = {},
) {
  const tabState = getOrCreateTabState(tabId);
  tabState.enrichedItems = [];
  tabState.enrichment = {
    status: ENRICHMENT_STATES.running,
    totalPosts,
    processedPosts: 0,
    totalAuthors,
    processedAuthors: 0,
    currentAuthor: null,
    currentPostIndex: 0,
    lastMessage,
    readyForDownload: false,
  };
  return persistState(tabId);
}

export function updateEnrichmentProgress(tabId, patch = {}) {
  const tabState = getOrCreateTabState(tabId);
  tabState.enrichment = {
    ...tabState.enrichment,
    ...patch,
    status: ENRICHMENT_STATES.running,
    readyForDownload: false,
  };
  return persistState(tabId);
}

export function completeEnrichment(tabId, enrichedItems, lastMessage) {
  const tabState = getOrCreateTabState(tabId);
  tabState.enrichedItems = Array.isArray(enrichedItems)
    ? enrichedItems.map((item) => ({ ...item }))
    : [];
  tabState.enrichment = {
    ...tabState.enrichment,
    status: ENRICHMENT_STATES.completed,
    processedPosts: tabState.enrichment.totalPosts,
    processedAuthors: tabState.enrichment.totalAuthors,
    currentAuthor: null,
    currentPostIndex: tabState.enrichment.totalPosts,
    lastMessage: lastMessage || "Enrichment completed.",
    readyForDownload: true,
  };
  return persistState(tabId);
}

export function failEnrichment(tabId, lastMessage) {
  const tabState = getOrCreateTabState(tabId);
  tabState.enrichedItems = [];
  tabState.enrichment = {
    ...tabState.enrichment,
    status: ENRICHMENT_STATES.failed,
    currentAuthor: null,
    lastMessage: lastMessage || "Enrichment failed.",
    readyForDownload: false,
  };
  return persistState(tabId);
}

export function cancelEnrichment(tabId, lastMessage) {
  const tabState = getOrCreateTabState(tabId);
  tabState.enrichedItems = [];
  tabState.enrichment = {
    ...tabState.enrichment,
    status: ENRICHMENT_STATES.cancelled,
    currentAuthor: null,
    lastMessage: lastMessage || "Enrichment cancelled.",
    readyForDownload: false,
  };
  return persistState(tabId);
}

export function getEnrichedItems(tabId) {
  return getOrCreateTabState(tabId).enrichedItems.map((item) => ({ ...item }));
}

export async function persistState(tabId) {
  const serializable = getSerializableState(tabId);

  await chrome.storage.session.set({
    [buildTabStorageKey(tabId)]: serializable,
  });

  return serializable;
}

export async function hydrateStateFromStorage(tabId) {
  const stored = await chrome.storage.session.get(buildTabStorageKey(tabId));
  const storedState = stored[buildTabStorageKey(tabId)];
  const tabState = createEmptyState();

  for (const item of storedState?.items || []) {
    const fingerprint = item?.fingerprint || buildFallbackFingerprint(item);

    if (!fingerprint) {
      continue;
    }

    tabState.itemsByFingerprint.set(fingerprint, { ...item, fingerprint });
  }

  tabState.enrichedItems = Array.isArray(storedState?.enrichedItems)
    ? storedState.enrichedItems.map((item) => ({ ...item }))
    : [];

  tabState.status = storedState?.status || STATUS_TEXT.idle;
  tabState.runState = storedState?.runState || RUN_STATES.idle;
  tabState.targetCount = clampTargetCount(storedState?.targetCount);
  tabState.noProgressCycles = storedState?.noProgressCycles || 0;
  tabState.stalledWaitCount = storedState?.stalledWaitCount || 0;
  tabState.lastReason = storedState?.lastReason || null;
  tabState.enrichment = {
    ...createEmptyEnrichmentState(),
    ...(storedState?.enrichment || {}),
  };
  tabStates.set(tabId, tabState);

  return getSerializableState(tabId);
}

export async function ensureHydratedState(tabId) {
  if (tabStates.has(tabId)) {
    return getSerializableState(tabId);
  }

  return hydrateStateFromStorage(tabId);
}

export async function clearTabState(tabId) {
  tabStates.delete(tabId);
  await chrome.storage.session.remove(buildTabStorageKey(tabId));
}

function resetEnrichmentState(tabState) {
  tabState.enrichedItems = [];
  tabState.enrichment = createEmptyEnrichmentState();
}
