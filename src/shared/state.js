import { STATUS_TEXT, STORAGE_KEYS } from "./constants.js";

const memoryState = {
  itemsByFingerprint: new Map(),
  status: STATUS_TEXT.idle,
};

export function getSerializableState() {
  return {
    items: Array.from(memoryState.itemsByFingerprint.values()).map(
      ({ fingerprint, ...item }) => item,
    ),
    count: memoryState.itemsByFingerprint.size,
    status: memoryState.status,
  };
}

export function markStatus(status) {
  memoryState.status = status;
  return persistState();
}

export function mergeNewItems(items) {
  let addedCount = 0;

  for (const item of items) {
    if (!item?.fingerprint) {
      continue;
    }

    if (memoryState.itemsByFingerprint.has(item.fingerprint)) {
      continue;
    }

    memoryState.itemsByFingerprint.set(item.fingerprint, item);
    addedCount += 1;
  }

  return {
    addedCount,
    state: getSerializableState(),
  };
}

export async function persistState() {
  const serializable = getSerializableState();

  await chrome.storage.local.set({
    [STORAGE_KEYS.items]: serializable.items,
    [STORAGE_KEYS.count]: serializable.count,
    [STORAGE_KEYS.status]: serializable.status,
  });

  return serializable;
}

export async function hydrateStateFromStorage() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.items,
    STORAGE_KEYS.status,
  ]);

  memoryState.itemsByFingerprint.clear();

  for (const item of stored[STORAGE_KEYS.items] || []) {
    const fingerprint = item?.fingerprint || buildFallbackFingerprint(item);

    if (!fingerprint) {
      continue;
    }

    memoryState.itemsByFingerprint.set(fingerprint, { ...item, fingerprint });
  }

  memoryState.status = stored[STORAGE_KEYS.status] || STATUS_TEXT.idle;

  return getSerializableState();
}

function buildFallbackFingerprint(item) {
  if (!item?.author || !item?.extracted_at) {
    return null;
  }

  return `${item.author.toLowerCase()}::${item.extracted_at}`;
}
