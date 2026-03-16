import { STATUS_TEXT } from "./constants.js";

const tabStates = new Map();

function createEmptyState() {
  return {
    itemsByFingerprint: new Map(),
    status: STATUS_TEXT.idle,
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
  };
}

export function markStatus(tabId, status) {
  const tabState = getOrCreateTabState(tabId);
  tabState.status = status;
  return persistState(tabId);
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

  return {
    addedCount,
    state: getSerializableState(tabId),
  };
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

  tabState.status = storedState?.status || STATUS_TEXT.idle;
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
