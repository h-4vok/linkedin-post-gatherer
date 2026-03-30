import {
  AI_QUEUE_PHASES,
  AI_RATE_LIMIT,
  AI_STATUS,
  ENRICHMENT_STATES,
  MESSAGE_TYPES,
  NO_PROGRESS_LIMIT,
  RUN_STATES,
  STALLED_WAIT_LIMIT,
  STORAGE_KEYS,
} from "../shared/constants.js";
import {
  buildAuthorCacheKey,
  buildAuthorSignalPatch,
  normalizeAuthorName,
} from "../shared/author-weight.js";
import { toEnrichedExportItem, toRawExportItem, serializeExportItems } from "../shared/export.js";
import {
  buildValidationResult,
  getAiConfig,
  getAiConfigError,
  getRetryDelayMs,
  saveAiConfig,
  shouldRetryGeminiError,
  validatePostsInterestBulk,
} from "./gemini.js";
import {
  applyCrawlerProgress,
  appendIgnoredSamples,
  cancelEnrichment,
  clearTabState,
  completeEnrichment,
  ensureHydratedState,
  failEnrichment,
  finalizeStopCrawler,
  getAiValidationEligibleItems,
  getEnrichedItems,
  getSerializableState,
  markFeedReady,
  mergeNewItems,
  persistState,
  resetDebugState,
  requestStopCrawler,
  setAiQueueState,
  setTargetCount,
  startEnrichment,
  startCrawler,
  updateEnrichmentProgress,
  updateInterestValidationBatch,
} from "../shared/state.js";

const activeEnrichments = new Map();
const activeAiValidationRuns = new Map();
const AI_RETRY_ALARM_PREFIX = "collector.ai.retry.";

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearTabState(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  void clearLegacyLocalState();
});

chrome.runtime.onStartup.addListener(() => {
  void clearLegacyLocalState();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm?.name?.startsWith(AI_RETRY_ALARM_PREFIX)) {
    return;
  }

  const tabId = Number.parseInt(alarm.name.slice(AI_RETRY_ALARM_PREFIX.length), 10);

  if (!Number.isInteger(tabId)) {
    return;
  }

  logServiceWorkerEvent("ai-validation-alarm-fired", {
    tabId,
    alarm: alarm.name,
  });
  void ensureHydratedState(tabId).then(() => ensureAiValidationRun(tabId));
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
  const tablessMessageTypes = new Set([MESSAGE_TYPES.getAiConfig, MESSAGE_TYPES.setAiConfig]);

  if (
    tabId == null &&
    !tablessMessageTypes.has(message?.type) &&
    message?.type !== MESSAGE_TYPES.exportRawRequest &&
    message?.type !== MESSAGE_TYPES.exportEnrichedRequest
  ) {
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

    case MESSAGE_TYPES.resetDebugRequest: {
      const activeRun = activeEnrichments.get(tabId);
      const activeAiRun = activeAiValidationRuns.get(tabId);

      if (activeRun) {
        activeRun.cancelled = true;
      }

      if (activeAiRun) {
        activeAiRun.cancelled = true;
      }

      const state = await resetDebugState(tabId);
      await chrome.alarms.clear(`${AI_RETRY_ALARM_PREFIX}${tabId}`);
      logServiceWorkerEvent("debug-reset-requested", { tabId });
      await sendCrawlerCommand(tabId, "reset");
      await broadcastCountUpdated(tabId, state);
      return { ok: true, state };
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

      if (preStart.runState === RUN_STATES.running || preStart.runState === RUN_STATES.stopping) {
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

      if (preStop.runState !== RUN_STATES.running && preStop.runState !== RUN_STATES.stopping) {
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
      if (Array.isArray(message.skippedSamples) && message.skippedSamples.length) {
        await appendIgnoredSamples(tabId, message.skippedSamples);
      }
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

    case MESSAGE_TYPES.getAiConfig: {
      const config = await getAiConfig();
      return { ok: true, config };
    }

    case MESSAGE_TYPES.setAiConfig: {
      const config = await saveAiConfig(message.config);
      logServiceWorkerEvent("ai-config-updated", {
        enabled: config.enabled,
        model: config.model,
      });
      return { ok: true, config };
    }

    case MESSAGE_TYPES.aiValidationStartRequest: {
      if (tabId == null) {
        return { ok: false, error: "tabId is required" };
      }

      const state = getSerializableState(tabId);
      const config = await getAiConfig();
      const configError = getAiConfigError(config);

      if (state.runState === RUN_STATES.running || state.runState === RUN_STATES.stopping) {
        return { ok: false, error: "Stop the crawler before running AI validation." };
      }

      if (activeAiValidationRuns.has(tabId)) {
        return { ok: true, started: false, aiQueue: state.aiQueue };
      }

      if (configError) {
        const queueState = await setAiQueueState(tabId, {
          phase: AI_QUEUE_PHASES.configError,
          retryAfterUntil: null,
          lastError: configError,
          lastMessage: "AI configuration needs attention.",
        });
        await broadcastCountUpdated(tabId, queueState);
        return { ok: false, error: configError, aiQueue: queueState.aiQueue };
      }

      const eligibleItems = getAiValidationEligibleItems(tabId);

      if (!eligibleItems.length) {
        return { ok: false, error: "No pending or unknown posts available for AI validation." };
      }

      const totalChunks = Math.ceil(eligibleItems.length / AI_RATE_LIMIT.chunkSize);
      const startedState = await setAiQueueState(tabId, {
        phase: AI_QUEUE_PHASES.running,
        retryAfterUntil: null,
        lastError: null,
        lastRequestAt: null,
        totalPosts: eligibleItems.length,
        processedPosts: 0,
        totalChunks,
        completedChunks: 0,
        currentChunkIndex: 1,
        lastMessage: "Starting AI validation bulk run.",
      });
      await broadcastAiActivity(
        tabId,
        `AI validation started for ${eligibleItems.length} posts in ${totalChunks} chunks.`
      );
      await broadcastCountUpdated(tabId, startedState);
      void ensureAiValidationRun(tabId);
      return { ok: true, started: true, aiQueue: startedState.aiQueue };
    }

    case MESSAGE_TYPES.aiValidationCancelRequest: {
      if (tabId == null) {
        return { ok: false, error: "tabId is required" };
      }

      const activeRun = activeAiValidationRuns.get(tabId);

      if (!activeRun) {
        return { ok: true, state: getSerializableState(tabId) };
      }

      activeRun.cancelled = true;
      const state = await setAiQueueState(tabId, {
        phase: AI_QUEUE_PHASES.cancelled,
        retryAfterUntil: null,
        lastError: null,
        lastMessage: "AI validation cancellation requested.",
      });
      await broadcastAiActivity(tabId, "AI validation cancellation requested.");
      await broadcastCountUpdated(tabId, state);
      return { ok: true, state };
    }

    case MESSAGE_TYPES.crawlerProgress: {
      if (message.phase === "stopped") {
        const state = await finalizeStopCrawler(
          tabId,
          message.reason === "stalled" ? "stalled" : "user"
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

    case MESSAGE_TYPES.exportRawRequest: {
      if (tabId == null) {
        return { ok: false, error: "tabId is required for export" };
      }

      const state = getSerializableState(tabId);
      logServiceWorkerEvent("raw-export-requested", {
        tabId,
        count: state.count,
      });
      const exportResult = await downloadJsonExport({
        items: state.items.map(toRawExportItem),
        filename: buildExportFilename("raw"),
      });

      logServiceWorkerEvent("raw-export-completed", {
        tabId,
        filename: exportResult.filename,
        count: state.count,
      });

      return { type: MESSAGE_TYPES.exportResult, ...exportResult };
    }

    case MESSAGE_TYPES.exportEnrichedRequest: {
      if (tabId == null) {
        return { ok: false, error: "tabId is required for export" };
      }

      const state = getSerializableState(tabId);

      if (state.runState === RUN_STATES.running || state.runState === RUN_STATES.stopping) {
        return {
          ok: false,
          error: "Stop the crawler before running enriched export.",
        };
      }

      if (!state.count) {
        return { ok: false, error: "No posts available to enrich." };
      }

      if (
        state.enrichment?.status === ENRICHMENT_STATES.completed &&
        state.enrichment?.readyForDownload
      ) {
        const enrichedItems = getEnrichedItems(tabId).map(toEnrichedExportItem);
        const exportResult = await downloadJsonExport({
          items: enrichedItems,
          filename: buildExportFilename("enriched"),
        });
        logServiceWorkerEvent("enriched-export-completed", {
          tabId,
          filename: exportResult.filename,
          count: enrichedItems.length,
        });
        return { type: MESSAGE_TYPES.exportResult, ...exportResult, ready: true };
      }

      if (activeEnrichments.has(tabId)) {
        return {
          ok: true,
          started: false,
          enrichment: state.enrichment,
        };
      }

      const startedState = await startEnrichment(tabId, {
        totalPosts: state.items.length,
        totalAuthors: countDistinctAuthors(state.items),
        lastMessage: "Starting author enrichment.",
      });
      await broadcastCountUpdated(tabId, startedState);
      void runEnrichment(tabId);
      return {
        ok: true,
        started: true,
        enrichment: startedState.enrichment,
      };
    }

    case MESSAGE_TYPES.exportPreviewRequest: {
      if (tabId == null) {
        return { ok: false, error: "tabId is required for preview" };
      }

      const state = getSerializableState(tabId);
      const mode = message.mode === "enriched" ? "enriched" : "raw";

      if (mode === "enriched") {
        if (
          state.enrichment?.status !== ENRICHMENT_STATES.completed ||
          !state.enrichment?.readyForDownload
        ) {
          return {
            ok: false,
            error: "Enriched preview is available after enrichment completes.",
          };
        }
      }

      const items =
        mode === "enriched"
          ? getEnrichedItems(tabId).map(toEnrichedExportItem)
          : state.items.map(toRawExportItem);

      return {
        ok: true,
        mode,
        count: items.length,
        filename: buildExportFilename(mode),
        json: serializeExportItems(items),
      };
    }

    case MESSAGE_TYPES.debugIgnoredSamplesRequest: {
      if (tabId == null) {
        return { ok: false, error: "tabId is required for ignored samples" };
      }

      const state = getSerializableState(tabId);
      return {
        ok: true,
        count: state.ignoredSamples?.length || 0,
        json: JSON.stringify(state.ignoredSamples || [], null, 2),
      };
    }

    case MESSAGE_TYPES.debugFeedDumpRequest: {
      if (tabId == null) {
        return { ok: false, error: "tabId is required for feed dump" };
      }

      const response = await chrome.tabs.sendMessage(tabId, {
        type: MESSAGE_TYPES.debugFeedDumpRequest,
      });

      if (!response?.ok) {
        return {
          ok: false,
          error: response?.error || "Failed to capture feed dump.",
        };
      }

      return response;
    }

    case MESSAGE_TYPES.enrichmentCancelRequest: {
      if (tabId == null) {
        return { ok: false, error: "tabId is required" };
      }

      const activeRun = activeEnrichments.get(tabId);

      if (!activeRun) {
        return { ok: true, state: getSerializableState(tabId) };
      }

      activeRun.cancelled = true;
      const state = await cancelEnrichment(tabId, "Enrichment cancellation requested.");
      await broadcastCountUpdated(tabId, state);
      return { ok: true, state };
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
    stalledWaitCount: state.stalledWaitCount,
    enrichment: state.enrichment,
    aiCounts: state.aiCounts,
    aiQueue: state.aiQueue,
  };

  try {
    await chrome.runtime.sendMessage(payload);
  } catch {
    // Popup listeners are optional and often disconnected.
  }

  try {
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.aiStatusUpdated,
      tabId,
      aiCounts: state.aiCounts,
      aiQueue: state.aiQueue,
    });
  } catch {
    // Popup listeners are optional and often disconnected.
  }

  try {
    await chrome.tabs.sendMessage(tabId, payload);
  } catch {
    // Content scripts are optional for non-LinkedIn tabs.
  }
}

async function broadcastAiActivity(tabId, text) {
  if (!text) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MESSAGE_TYPES.aiActivity,
      text,
    });
  } catch {
    // Content scripts are optional for non-LinkedIn tabs.
  }
}

function buildExportFilename(mode, date = new Date()) {
  const suffix = mode === "enriched" ? "_enriched" : "";
  return `linkedin_dump_${date.toISOString().slice(0, 10)}${suffix}.json`;
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
  await chrome.storage.local.remove([STORAGE_KEYS.items, STORAGE_KEYS.count, STORAGE_KEYS.status]);
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

function ensureAiValidationRun(tabId) {
  if (activeAiValidationRuns.has(tabId)) {
    return activeAiValidationRuns.get(tabId).promise;
  }

  const run = {
    cancelled: false,
    promise: null,
  };
  run.promise = runAiValidation(tabId, run).finally(() => {
    activeAiValidationRuns.delete(tabId);
  });
  activeAiValidationRuns.set(tabId, run);
  return run.promise;
}

async function runAiValidation(tabId, run) {
  const initialState = getSerializableState(tabId);

  if (initialState.aiQueue?.phase === AI_QUEUE_PHASES.cancelled) {
    return;
  }

  while (true) {
    if (run.cancelled) {
      const cancelledState = await setAiQueueState(tabId, {
        phase: AI_QUEUE_PHASES.cancelled,
        retryAfterUntil: null,
        lastError: null,
        lastMessage: "AI validation cancelled.",
      });
      await broadcastAiActivity(tabId, "AI validation cancelled.");
      await broadcastCountUpdated(tabId, cancelledState);
      return;
    }

    const eligibleItems = getAiValidationEligibleItems(tabId);

    if (!eligibleItems.length) {
      const completedState = await setAiQueueState(tabId, {
        phase: AI_QUEUE_PHASES.completed,
        retryAfterUntil: null,
        lastError: null,
        currentChunkIndex: 0,
        lastMessage: "AI validation completed for the current batch.",
      });
      await broadcastAiActivity(
        tabId,
        `AI validation completed. interested: ${completedState.aiCounts.interested}, not_interested: ${completedState.aiCounts.not_interested}, unknown: ${completedState.aiCounts.unknown}.`
      );
      await broadcastCountUpdated(tabId, completedState);
      return;
    }

    const config = await getAiConfig();
    const configError = getAiConfigError(config);

    if (configError) {
      const queueState = await setAiQueueState(tabId, {
        phase: AI_QUEUE_PHASES.configError,
        retryAfterUntil: null,
        lastError: configError,
        lastMessage: "AI configuration needs attention.",
      });
      await broadcastCountUpdated(tabId, queueState);
      return;
    }

    await pauseForRateLimit(tabId);

    const chunk = eligibleItems.slice(0, AI_RATE_LIMIT.chunkSize);
    const stateBeforeChunk = getSerializableState(tabId);
    const currentChunkIndex = Math.min(
      (stateBeforeChunk.aiQueue?.completedChunks || 0) + 1,
      Math.max(1, stateBeforeChunk.aiQueue?.totalChunks || Math.ceil(eligibleItems.length / AI_RATE_LIMIT.chunkSize))
    );
    const processingState = await setAiQueueState(tabId, {
      phase: AI_QUEUE_PHASES.running,
      retryAfterUntil: null,
      lastError: null,
      lastRequestAt: new Date().toISOString(),
      currentChunkIndex,
      lastMessage: `Running AI validation chunk ${currentChunkIndex}/${stateBeforeChunk.aiQueue?.totalChunks || 1}.`,
    });
    await broadcastCountUpdated(tabId, processingState);
    await broadcastAiActivity(
      tabId,
      `AI validation chunk ${currentChunkIndex}/${processingState.aiQueue.totalChunks} running for ${chunk.length} posts.`
    );

    const attempts = Math.max(
      ...chunk.map((item) => Number(item.interest_validation?.attempts || 0)),
      0
    ) + 1;
    logServiceWorkerEvent("ai-validation-chunk-started", {
      tabId,
      chunkIndex: currentChunkIndex,
      attempts,
      chunkSize: chunk.length,
      remainingEligible: eligibleItems.length,
    });

    try {
      const result = await validatePostsInterestBulk(chunk, config);
      const interestedIds = new Set(result.interestedIds);
      const updatedState = await updateInterestValidationBatch(
        tabId,
        chunk.map((item) => ({
          fingerprint: item.fingerprint,
          validationPatch: buildValidationResult(
            interestedIds.has(item.fingerprint) ? AI_STATUS.interested : AI_STATUS.notInterested,
            attempts,
            null
          ),
        }))
      );
      const progressedState = await setAiQueueState(tabId, {
        phase: AI_QUEUE_PHASES.running,
        retryAfterUntil: null,
        lastError: null,
        lastRequestAt: new Date().toISOString(),
        processedPosts: Math.min(
          updatedState.aiQueue.totalPosts,
          (updatedState.aiQueue.processedPosts || 0) + chunk.length
        ),
        completedChunks: Math.min(
          updatedState.aiQueue.totalChunks,
          (updatedState.aiQueue.completedChunks || 0) + 1
        ),
        currentChunkIndex: Math.min(
          updatedState.aiQueue.totalChunks,
          (updatedState.aiQueue.completedChunks || 0) + 2
        ),
        lastMessage: `Chunk ${currentChunkIndex}/${updatedState.aiQueue.totalChunks} completed.`,
      });
      const interestedCount = chunk.filter((item) => interestedIds.has(item.fingerprint)).length;
      logServiceWorkerEvent("ai-validation-chunk-completed", {
        tabId,
        chunkIndex: currentChunkIndex,
        attempts,
        chunkSize: chunk.length,
        interestedCount,
      });
      await broadcastAiActivity(
        tabId,
        `AI validation chunk ${currentChunkIndex}/${progressedState.aiQueue.totalChunks} completed. Interested: ${interestedCount}/${chunk.length}.`
      );
      await broadcastCountUpdated(tabId, progressedState);
    } catch (error) {
      const normalizedError = normalizeAiError(error);
      const shouldRetry = shouldRetryGeminiError(normalizedError, attempts);

      if (!shouldRetry) {
        const updatedState = await updateInterestValidationBatch(
          tabId,
          chunk.map((item) => ({
            fingerprint: item.fingerprint,
            validationPatch: buildValidationResult(AI_STATUS.unknown, attempts, normalizedError.kind),
          }))
        );
        const failedState = await setAiQueueState(tabId, {
          phase: AI_QUEUE_PHASES.failed,
          retryAfterUntil: null,
          lastError: normalizedError.message,
          processedPosts: Math.min(
            updatedState.aiQueue.totalPosts,
            (updatedState.aiQueue.processedPosts || 0) + chunk.length
          ),
          completedChunks: Math.min(
            updatedState.aiQueue.totalChunks,
            (updatedState.aiQueue.completedChunks || 0) + 1
          ),
          currentChunkIndex: Math.min(
            updatedState.aiQueue.totalChunks,
            (updatedState.aiQueue.completedChunks || 0) + 2
          ),
          lastMessage: `Chunk ${currentChunkIndex}/${updatedState.aiQueue.totalChunks} failed and was marked unknown.`,
        });
        logServiceWorkerEvent("ai-validation-chunk-failed", {
          tabId,
          chunkIndex: currentChunkIndex,
          kind: normalizedError.kind,
          attempts,
          message: normalizedError.message,
        });
        await broadcastAiActivity(
          tabId,
          `AI validation chunk ${currentChunkIndex}/${failedState.aiQueue.totalChunks} failed. ${chunk.length} posts marked unknown.`
        );
        await broadcastCountUpdated(tabId, failedState);
        continue;
      }

      const retryDelayMs = getRetryDelayMs(normalizedError, attempts);
      const retryUntil = new Date(Date.now() + retryDelayMs).toISOString();
      await updateInterestValidationBatch(
        tabId,
        chunk.map((item) => ({
          fingerprint: item.fingerprint,
          validationPatch: {
            attempts,
            error: normalizedError.kind,
          },
        }))
      );
      const queueState = await setAiQueueState(tabId, {
        phase: AI_QUEUE_PHASES.backingOff,
        retryAfterUntil: retryUntil,
        lastError: normalizedError.message,
        currentChunkIndex,
        lastMessage: `Backing off before retrying chunk ${currentChunkIndex}.`,
      });
      logServiceWorkerEvent("ai-validation-chunk-backoff", {
        tabId,
        chunkIndex: currentChunkIndex,
        kind: normalizedError.kind,
        attempts,
        retryDelayMs,
        retryUntil,
        message: normalizedError.message,
      });
      await broadcastAiActivity(
        tabId,
        `AI validation backing off before retrying chunk ${currentChunkIndex}/${queueState.aiQueue.totalChunks}.`
      );
      await broadcastCountUpdated(tabId, queueState);
      await scheduleValidationRetryAlarm(tabId, retryDelayMs);
      return;
    }
  }
}

async function pauseForRateLimit(tabId) {
  const state = getSerializableState(tabId);
  const retryAfterUntil = state.aiQueue?.retryAfterUntil;

  if (!retryAfterUntil) {
    return;
  }

  const waitMs = new Date(retryAfterUntil).getTime() - Date.now();

  if (waitMs > 0) {
    logServiceWorkerEvent("ai-validation-waiting", {
      tabId,
      waitMs,
      retryAfterUntil,
    });
    await delay(waitMs);
  }

  await setAiQueueState(tabId, {
    retryAfterUntil: null,
  });
}

async function runEnrichment(tabId) {
  const run = { cancelled: false };
  activeEnrichments.set(tabId, run);

  try {
    const state = getSerializableState(tabId);
    const enrichedItems = state.items.map((item) => ({ ...item }));
    const authorBuckets = buildAuthorBuckets(enrichedItems);

    let processedAuthors = 0;
    let processedPosts = 0;

    for (const bucket of authorBuckets) {
      if (run.cancelled) {
        const cancelledState = await cancelEnrichment(tabId, "Enrichment cancelled.");
        await broadcastCountUpdated(tabId, cancelledState);
        return;
      }

      const nextPostIndex = processedPosts + 1;
      let progressState = await updateEnrichmentProgress(tabId, {
        currentAuthor: bucket.author,
        currentPostIndex: nextPostIndex,
        lastMessage: `Resolving ${bucket.author}.`,
      });
      await broadcastCountUpdated(tabId, progressState);

      const authorData = await resolveAuthorData(bucket, tabId);

      for (const itemIndex of bucket.indexes) {
        enrichedItems[itemIndex] = {
          ...enrichedItems[itemIndex],
          ...buildAuthorSignalPatch(authorData),
        };
      }

      processedAuthors += 1;
      processedPosts += bucket.indexes.length;

      progressState = await updateEnrichmentProgress(tabId, {
        processedAuthors,
        processedPosts,
        currentAuthor: bucket.author,
        currentPostIndex: processedPosts,
        lastMessage:
          authorData.source === "cache"
            ? `Cache hit for ${bucket.author}.`
            : `Profile resolved for ${bucket.author}.`,
      });
      await broadcastCountUpdated(tabId, progressState);
    }

    const completedState = await completeEnrichment(
      tabId,
      enrichedItems,
      "Enriched export ready for download."
    );
    await broadcastCountUpdated(tabId, completedState);
  } catch (error) {
    const failedState = await failEnrichment(tabId, error.message || "Enrichment failed.");
    await broadcastCountUpdated(tabId, failedState);
    logServiceWorkerEvent("enrichment-failed", {
      tabId,
      error: error.message,
    });
  } finally {
    activeEnrichments.delete(tabId);
  }
}

function buildAuthorBuckets(items) {
  const buckets = new Map();

  items.forEach((item, index) => {
    const cacheKey = buildAuthorCacheKey({
      profileUrl: item.author_profile_url,
      author: item.author,
    });
    const fallbackKey = `item:${index}`;
    const mapKey = cacheKey || fallbackKey;

    if (!buckets.has(mapKey)) {
      buckets.set(mapKey, {
        author: item.author || `Author ${index + 1}`,
        profileUrl: item.author_profile_url || null,
        cacheKey,
        fallbackAuthorKey: buildAuthorCacheKey({ author: item.author }),
        indexes: [],
      });
    }

    buckets.get(mapKey).indexes.push(index);
  });

  return Array.from(buckets.values());
}

function countDistinctAuthors(items) {
  return buildAuthorBuckets(items).length;
}

async function resolveAuthorData(bucket, tabId) {
  const cacheEntry = await findAuthorCacheEntry(bucket);

  if (cacheEntry) {
    logServiceWorkerEvent("author-cache-hit", {
      tabId,
      author: bucket.author,
      cacheKey: cacheEntry.cacheKey,
    });
    return { ...cacheEntry.entry, source: "cache" };
  }

  logServiceWorkerEvent("author-cache-miss", {
    tabId,
    author: bucket.author,
    profileUrl: bucket.profileUrl,
  });

  if (!bucket.profileUrl) {
    return {
      role: null,
      followers: null,
      source: "fallback",
    };
  }

  const profileSignals = await extractProfileSignals(bucket.profileUrl);
  const entry = {
    author: bucket.author,
    normalized_author: normalizeAuthorName(bucket.author),
    profile_url: bucket.profileUrl,
    role: profileSignals.role,
    followers: profileSignals.followers,
    resolved_at: new Date().toISOString(),
  };

  await upsertAuthorCacheEntry(bucket, {
    ...entry,
    ...buildAuthorSignalPatch(entry),
  });

  return { ...entry, source: "profile" };
}

async function findAuthorCacheEntry(bucket) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.authorCache);
  const cache = stored[STORAGE_KEYS.authorCache] || {};

  if (bucket.cacheKey && cache[bucket.cacheKey]) {
    return { cacheKey: bucket.cacheKey, entry: cache[bucket.cacheKey] };
  }

  if (bucket.fallbackAuthorKey && cache[bucket.fallbackAuthorKey]) {
    return {
      cacheKey: bucket.fallbackAuthorKey,
      entry: cache[bucket.fallbackAuthorKey],
    };
  }

  return null;
}

async function upsertAuthorCacheEntry(bucket, entry) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.authorCache);
  const cache = stored[STORAGE_KEYS.authorCache] || {};

  if (bucket.cacheKey) {
    cache[bucket.cacheKey] = entry;
  }

  if (bucket.fallbackAuthorKey) {
    cache[bucket.fallbackAuthorKey] = entry;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.authorCache]: cache,
  });
}

async function extractProfileSignals(profileUrl) {
  const profileTab = await chrome.tabs.create({
    url: profileUrl,
    active: false,
  });

  try {
    await waitForTabLoad(profileTab.id);
    await delay(800);

    const response = await chrome.tabs.sendMessage(profileTab.id, {
      type: MESSAGE_TYPES.profileExtractRequest,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Profile extraction failed.");
    }

    return response.profile;
  } finally {
    await chrome.tabs.remove(profileTab.id).catch(() => {});
  }
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      reject(new Error("Timed out waiting for profile tab."));
    }, 20000);

    function handleUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") {
        return;
      }

      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      resolve();
    }

    chrome.tabs.onUpdated.addListener(handleUpdated);
  });
}

async function downloadJsonExport({ items, filename }) {
  const json = JSON.stringify(items, null, 2);
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: true,
  });

  await chrome.storage.local.set({
    [STORAGE_KEYS.lastExportAt]: new Date().toISOString(),
  });

  return {
    ok: true,
    downloadId,
    filename,
    count: items.length,
  };
}

function normalizeAiError(error) {
  if (error?.kind) {
    return error;
  }

  const nextError = new Error(error?.message || "Unexpected AI validation error.");
  nextError.kind = "network-error";
  return nextError;
}

async function scheduleValidationRetryAlarm(tabId, delayMs) {
  const alarmName = `${AI_RETRY_ALARM_PREFIX}${tabId}`;
  const delayMinutes = Math.max(1 / 60, delayMs / 60000);

  await chrome.alarms.create(alarmName, {
    delayInMinutes: delayMinutes,
  });

  logServiceWorkerEvent("ai-validation-alarm-scheduled", {
    tabId,
    alarmName,
    delayMs,
    delayMinutes,
  });
}

function delay(ms) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
