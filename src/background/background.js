import { MESSAGE_TYPES, STATUS_TEXT, STORAGE_KEYS } from "../shared/constants.js";
import {
  getSerializableState,
  hydrateStateFromStorage,
  markStatus,
  mergeNewItems,
  persistState,
} from "../shared/state.js";

const hydrationReady = hydrateStateFromStorage().catch((error) => {
  console.error("[harvester] failed to hydrate state", error);
});

chrome.runtime.onInstalled.addListener(async () => {
  await hydrateStateFromStorage();
  await persistState();
});

chrome.runtime.onStartup.addListener(async () => {
  await hydrateStateFromStorage();
  await persistState();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => {
      console.error("[harvester] background error", error);
      sendResponse({ ok: false, error: error.message });
    });

  return true;
});

async function handleMessage(message) {
  await hydrationReady;

  switch (message?.type) {
    case MESSAGE_TYPES.feedReady: {
      const status = message.feedFound
        ? STATUS_TEXT.attached
        : STATUS_TEXT.unavailable;
      const state = await markStatus(status);
      await broadcastCountUpdated(state);
      return { ok: true, state };
    }

    case MESSAGE_TYPES.newItems: {
      if (!Array.isArray(message.items)) {
        return { ok: false, error: "items must be an array" };
      }

      await markStatus(STATUS_TEXT.scanning);
      const mergeResult = mergeNewItems(message.items);
      const state = await persistState();
      await broadcastCountUpdated(state);
      return { ok: true, addedCount: mergeResult.addedCount, state };
    }

    case MESSAGE_TYPES.exportRequest: {
      const state = getSerializableState();
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

async function broadcastCountUpdated(state) {
  try {
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.countUpdated,
      count: state.count,
      status: state.status,
    });
  } catch {
    // Popup listeners are optional and often disconnected.
  }
}

function buildExportFilename(date = new Date()) {
  return `linkedin_dump_${date.toISOString().slice(0, 10)}.json`;
}
