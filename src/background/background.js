import {
  MESSAGE_TYPES,
  NO_PROGRESS_LIMIT,
  RUN_STATES,
  STALLED_WAIT_LIMIT,
  STATUS_TEXT,
  STORAGE_KEYS,
} from "../shared/constants.js";
import {
  applyCrawlerProgress,
  clearTabState,
  ensureHydratedState,
  finalizeStopCrawler,
  getSerializableState,
  markFeedReady,
  mergeNewItems,
  persistState,
  requestStopCrawler,
  setTargetCount,
  startCrawler,
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
      logServiceWorkerEvent("background-error", { message: error.message });
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
      const state = await markFeedReady(tabId, message.feedFound);
      logServiceWorkerEvent("feed-ready", {
        tabId,
        feedFound: Boolean(message.feedFound),
        runState: state.runState,
      });
      await broadcastCountUpdated(tabId, state);
      return { ok: true, state };
    }

    case MESSAGE_TYPES.setTargetRequest: {
      const state = await setTargetCount(tabId, message.targetCount);
      logServiceWorkerEvent("target-updated", {
        tabId,
        targetCount: state.targetCount,
      });
      await broadcastCountUpdated(tabId, state);
      return { ok: true, state };
    }

    case MESSAGE_TYPES.startRequest: {
      const preStart = getSerializableState(tabId);

      if (preStart.runState === RUN_STATES.unavailable) {
        return { ok: false, error: "LinkedIn feed is unavailable on this tab." };
      }

      if (
        preStart.runState === RUN_STATES.running ||
        preStart.runState === RUN_STATES.stopping
      ) {
        return { ok: true, state: preStart };
      }

      const state = await startCrawler(tabId, message.targetCount);
      logServiceWorkerEvent("start-requested", {
        tabId,
        targetCount: state.targetCount,
      });
      await broadcastCountUpdated(tabId, state);
      const commandDelivered = await sendCrawlerCommand(tabId, "start", {
        targetCount: state.targetCount,
      });
      if (!commandDelivered) {
        const unavailableState = await markFeedReady(tabId, false);
        await broadcastCountUpdated(tabId, unavailableState);
        return {
          ok: false,
          error: "LinkedIn feed is unavailable on this tab.",
          state: unavailableState,
        };
      }
      return { ok: true, state };
    }

    case MESSAGE_TYPES.stopRequest: {
      const preStop = getSerializableState(tabId);

      if (
        preStop.runState !== RUN_STATES.running &&
        preStop.runState !== RUN_STATES.stopping
      ) {
        return { ok: true, state: preStop };
      }

      const state = await requestStopCrawler(tabId);
      logServiceWorkerEvent("stop-requested", { tabId });
      await broadcastCountUpdated(tabId, state);
      await sendCrawlerCommand(tabId, "stop");
      return { ok: true, state };
    }

    case MESSAGE_TYPES.newItems: {
      if (!Array.isArray(message.items)) {
        return { ok: false, error: "items must be an array" };
      }

      const mergeResult = mergeNewItems(tabId, message.items);
      const state = await persistState(tabId);
      logServiceWorkerEvent("items-merged", {
        tabId,
        receivedCount: message.items.length,
        addedCount: mergeResult.addedCount,
        totalCount: state.count,
      });
      await broadcastCountUpdated(tabId, state);
      return { ok: true, addedCount: mergeResult.addedCount, state };
    }

    case MESSAGE_TYPES.crawlerProgress: {
      if (message.phase === "stopped") {
        const state = await finalizeStopCrawler(
          tabId,
          message.reason === "stalled" ? "stalled" : "user",
        );
        logServiceWorkerEvent("crawler-stopped", {
          tabId,
          reason: message.reason || "user",
        });
        await broadcastCountUpdated(tabId, state);
        return {
          ok: true,
          state,
          shouldStop: true,
          stopReason: message.reason || "user",
        };
      }

      const progressResult = await applyCrawlerProgress(tabId, {
        addedCount: message.addedCount,
        noProgressLimit: NO_PROGRESS_LIMIT,
        stalledWaitLimit: STALLED_WAIT_LIMIT,
      });

      logServiceWorkerEvent("crawler-progress", {
        tabId,
        addedCount: message.addedCount || 0,
        totalListItems: message.totalListItems || 0,
        noProgressCycles: progressResult.state.noProgressCycles,
        stalledWaitCount: progressResult.state.stalledWaitCount,
        count: progressResult.state.count,
        runState: progressResult.state.runState,
        shouldLongWait: progressResult.shouldLongWait,
        longWaitMs: progressResult.longWaitMs || 0,
        stopReason: progressResult.stopReason,
      });

      await broadcastCountUpdated(tabId, progressResult.state);
      return { ok: true, ...progressResult };
    }

    case MESSAGE_TYPES.log: {
      logServiceWorkerEvent(message.event || "content-log", {
        tabId,
        payload: message.payload || null,
      });
      return { ok: true };
    }

    case MESSAGE_TYPES.exportRequest: {
      if (tabId == null) {
        return { ok: false, error: "tabId is required for export" };
      }

      const state = getSerializableState(tabId);
      logServiceWorkerEvent("export-requested", {
        tabId,
        count: state.count,
      });
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

      logServiceWorkerEvent("export-completed", {
        tabId,
        filename,
        count: state.count,
      });

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
  const payload = {
    type: MESSAGE_TYPES.countUpdated,
    tabId,
    count: state.count,
    repostCount: state.repostCount,
    status: state.status,
    runState: state.runState,
    targetCount: state.targetCount,
    noProgressCycles: state.noProgressCycles,
  };

  try {
    await chrome.runtime.sendMessage(payload);
  } catch {
    // Popup listeners are optional and often disconnected.
  }

  try {
    await chrome.tabs.sendMessage(tabId, payload);
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

async function sendCrawlerCommand(tabId, action, payload = {}) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MESSAGE_TYPES.crawlerCommand,
      action,
      ...payload,
    });
    logServiceWorkerEvent("crawler-command", { tabId, action, payload });
    return true;
  } catch (error) {
    logServiceWorkerEvent("crawler-command-failed", {
      tabId,
      action,
      error: error.message,
    });
    return false;
  }
}

function logServiceWorkerEvent(event, payload = {}) {
  console.log("[harvester][service-worker]", event, payload);
}
