import { MESSAGE_TYPES, STATUS_TEXT, STORAGE_KEYS } from "../shared/constants.js";
import {
  clearTabState,
  ensureHydratedState,
  getSerializableState,
  markStatus,
  mergeNewItems,
  persistState,
} from "../shared/state.js";

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearTabState(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  void clearLegacyLocalState();
});

chrome.runtime.onStartup.addListener(() => {
  void clearLegacyLocalState();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message, _sender)
    .then((response) => sendResponse(response))
    .catch((error) => {
      console.error("[harvester] background error", error);
      sendResponse({ ok: false, error: error.message });
    });

  return true;
});

async function handleMessage(message, sender) {
  const tabId = resolveTabId(message, sender);

  if (tabId == null && message?.type !== MESSAGE_TYPES.exportRequest) {
    return { ok: false, error: "tabId is required" };
  }

  if (tabId != null) {
    await ensureHydratedState(tabId);
  }

  switch (message?.type) {
    case MESSAGE_TYPES.getState: {
      const state = getSerializableState(tabId);
      return { ok: true, state, tabId };
    }

    case MESSAGE_TYPES.feedReady: {
      const status = message.feedFound
        ? STATUS_TEXT.attached
        : STATUS_TEXT.unavailable;
      const state = await markStatus(tabId, status);
      await broadcastCountUpdated(tabId, state);
      return { ok: true, state };
    }

    case MESSAGE_TYPES.newItems: {
      if (!Array.isArray(message.items)) {
        return { ok: false, error: "items must be an array" };
      }

      await markStatus(tabId, STATUS_TEXT.scanning);
      const mergeResult = mergeNewItems(tabId, message.items);
      const state = await persistState(tabId);
      await broadcastCountUpdated(tabId, state);
      return { ok: true, addedCount: mergeResult.addedCount, state };
    }

    case MESSAGE_TYPES.exportRequest: {
      if (tabId == null) {
        return { ok: false, error: "tabId is required for export" };
      }

      const state = getSerializableState(tabId);
      const filename = buildExportFilename();
      const json = JSON.stringify(state.items, null, 2);
      const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;

      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename,
        saveAs: true,
      });

      const exportResult = {
        ok: true,
        downloadId,
        filename,
        count: state.count,
      };

      await chrome.storage.local.set({
        [STORAGE_KEYS.lastExportAt]: new Date().toISOString(),
      });

      return { type: MESSAGE_TYPES.exportResult, ...exportResult };
    }

    default:
      return { ok: false, error: "unknown message type" };
  }
}

async function broadcastCountUpdated(tabId, state) {
  try {
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.countUpdated,
      tabId,
      count: state.count,
      repostCount: state.repostCount,
      status: state.status,
    });
  } catch {
    // Popup listeners are optional and often disconnected.
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MESSAGE_TYPES.countUpdated,
      tabId,
      count: state.count,
      repostCount: state.repostCount,
      status: state.status,
    });
  } catch {
    // Content scripts are optional for non-LinkedIn tabs.
  }
}

function buildExportFilename(date = new Date()) {
  return `linkedin_dump_${date.toISOString().slice(0, 10)}.json`;
}

function resolveTabId(message, sender) {
  if (Number.isInteger(message?.tabId)) {
    return message.tabId;
  }

  if (Number.isInteger(sender?.tab?.id)) {
    return sender.tab.id;
  }

  return null;
}

async function clearLegacyLocalState() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.items,
    STORAGE_KEYS.count,
    STORAGE_KEYS.status,
  ]);
}
