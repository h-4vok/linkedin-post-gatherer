import {
  AI_QUEUE_PHASES,
  AI_STATUS,
  AI_VALIDATION_SOURCE,
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

function createEmptyAiQueueState() {
  return {
    phase: AI_QUEUE_PHASES.idle,
    retryAfterUntil: null,
    lastRequestAt: null,
    lastError: null,
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
    aiQueue: createEmptyAiQueueState(),
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
  const itemsWithFingerprint = Array.from(tabState.itemsByFingerprint.values());
  const items = itemsWithFingerprint.map(({ fingerprint, ...item }) => item);
  const aiCounts = getAiCounts(itemsWithFingerprint);

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
    aiCounts,
    aiQueue: { ...tabState.aiQueue, pendingCount: aiCounts.pending },
  };
}

export function getExportItems(tabId) {
  return Array.from(getOrCreateTabState(tabId).itemsByFingerprint.values()).map(
    ({ fingerprint, ...item }) => item,
  );
}

export function markStatus(tabId, status) {
  const tabState = getOrCreateTabState(tabId);
  tabState.status = status;
  return persistState(tabId);
}

export function resetDebugState(tabId) {
  const tabState = getOrCreateTabState(tabId);
  const preservedTargetCount = tabState.targetCount;

  tabStates.set(tabId, {
    ...createEmptyState(),
    targetCount: preservedTargetCount,
    status: STATUS_TEXT.attached,
    runState: RUN_STATES.idle,
  });

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
  const addedFingerprints = [];

  for (const item of items) {
    if (!item?.fingerprint) {
      continue;
    }

    if (tabState.itemsByFingerprint.has(item.fingerprint)) {
      continue;
    }

    tabState.itemsByFingerprint.set(item.fingerprint, {
      ...item,
      interest_validation:
        item.interest_validation || createPendingInterestValidation(),
    });
    addedCount += 1;
    addedFingerprints.push(item.fingerprint);
  }

  if (addedCount > 0) {
    resetEnrichmentState(tabState);
  }

  return {
    addedCount,
    addedFingerprints,
    state: getSerializableState(tabId),
  };
}

export function getPendingValidationItems(tabId) {
  return Array.from(getOrCreateTabState(tabId).itemsByFingerprint.values()).filter(
    (item) => item?.interest_validation?.status === AI_STATUS.pending,
  );
}

export function updateInterestValidation(tabId, fingerprint, validationPatch) {
  const tabState = getOrCreateTabState(tabId);
  const currentItem = tabState.itemsByFingerprint.get(fingerprint);

  if (!currentItem) {
    return persistState(tabId);
  }

  tabState.itemsByFingerprint.set(fingerprint, {
    ...currentItem,
    interest_validation: {
      ...createPendingInterestValidation(),
      ...currentItem.interest_validation,
      ...validationPatch,
    },
  });

  return persistState(tabId);
}

export function setAiQueueState(tabId, queuePatch) {
  const tabState = getOrCreateTabState(tabId);
  tabState.aiQueue = {
    ...tabState.aiQueue,
    ...queuePatch,
  };
  return persistState(tabId);
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

    tabState.itemsByFingerprint.set(fingerprint, {
      ...item,
      fingerprint,
      interest_validation:
        item?.interest_validation || createPendingInterestValidation(),
    });
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
  tabState.aiQueue = {
    ...createEmptyAiQueueState(),
    ...(storedState?.aiQueue || {}),
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

function createPendingInterestValidation() {
  return {
    status: AI_STATUS.pending,
    source: AI_VALIDATION_SOURCE,
    attempts: 0,
    validated_at: null,
    error: null,
  };
}

function getAiCounts(items) {
  return items.reduce(
    (counts, item) => {
      switch (item?.interest_validation?.status) {
        case AI_STATUS.interested:
          counts.interesa += 1;
          break;
        case AI_STATUS.notInterested:
          counts.no_interesa += 1;
          break;
        case AI_STATUS.unknown:
          counts.unknown += 1;
          break;
        default:
          counts.pending += 1;
          break;
      }

      return counts;
    },
    {
      pending: 0,
      interesa: 0,
      no_interesa: 0,
      unknown: 0,
    },
  );
}
