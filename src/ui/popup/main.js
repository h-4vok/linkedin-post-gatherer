import {
  ENRICHMENT_STATES,
  MESSAGE_TYPES,
  RUN_STATES,
  STALLED_WAIT_LIMIT,
  TARGET_COUNT_DEFAULT,
  TARGET_COUNT_MAX,
  TARGET_COUNT_MIN,
} from "../../shared/constants.js";
import "./style.css";

const ACTIVITY_LIMIT = 4;
const TARGET_PRESETS = [25, 50, 100];

const heroCountElement = document.querySelector("#hero-count");
const heroTargetElement = document.querySelector("#hero-target");
const repostCountElement = document.querySelector("#repost-count");
const waitValueElement = document.querySelector("#wait-value");
const modeValueElement = document.querySelector("#mode-value");
const statusElement = document.querySelector("#status");
const statusBadgeElement = document.querySelector("#status-badge");
const targetInput = document.querySelector("#target-count");
const startButton = document.querySelector("#start-button");
const stopButton = document.querySelector("#stop-button");
const exportRawButton = document.querySelector("#export-raw-button");
const exportEnrichedButton = document.querySelector("#export-enriched-button");
const exportFeedback = document.querySelector("#export-feedback");
const activityLog = document.querySelector("#activity-log");
const enrichmentStatusElement = document.querySelector("#enrichment-status");
const enrichmentPostsElement = document.querySelector("#enrichment-posts");
const enrichmentAuthorsElement = document.querySelector("#enrichment-authors");
const enrichmentCurrentElement = document.querySelector("#enrichment-current");
const presetButtons = Array.from(
  document.querySelectorAll("[data-target-preset]"),
);

let activeTabId = null;
let currentCount = 0;
let currentRepostCount = 0;
let currentRunState = RUN_STATES.idle;
let currentStalledWaitCount = 0;
let currentStatus = "Waiting for LinkedIn feed...";
let activityItems = [];
let currentEnrichment = createEmptyEnrichmentState();

void hydratePopup();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== MESSAGE_TYPES.countUpdated) {
    return;
  }

  if (message.tabId !== activeTabId) {
    return;
  }

  const nextCount = message.count || 0;
  const nextRepostCount = message.repostCount || 0;
  const nextRunState = message.runState || RUN_STATES.idle;
  const nextStatus = message.status || "Idle";
  const nextTargetCount = message.targetCount || TARGET_COUNT_DEFAULT;
  const nextStalledWaitCount = message.stalledWaitCount || 0;
  const nextEnrichment = message.enrichment || createEmptyEnrichmentState();

  if (nextCount > currentCount) {
    pushActivity(`Captured ${nextCount - currentCount} new posts.`);
  }

  if (nextRepostCount > currentRepostCount) {
    pushActivity(`Detected ${nextRepostCount} reposts so far.`);
  }

  if (nextStalledWaitCount > currentStalledWaitCount) {
    pushActivity(
      `Long wait ${nextStalledWaitCount} / ${STALLED_WAIT_LIMIT} scheduled.`,
    );
  }

  if (nextStatus !== currentStatus && nextStatus) {
    pushActivity(nextStatus);
  }

  currentCount = nextCount;
  currentRepostCount = nextRepostCount;
  currentRunState = nextRunState;
  currentStalledWaitCount = nextStalledWaitCount;
  currentStatus = nextStatus;
  currentEnrichment = nextEnrichment;

  renderCount(nextCount);
  renderRepostCount(nextRepostCount);
  renderWaitState(nextStalledWaitCount);
  renderStatus(nextStatus, nextRunState);
  renderTargetCount(nextTargetCount);
  renderControls(nextRunState);
  renderEnrichment(nextEnrichment);
});

targetInput?.addEventListener("change", async () => {
  const targetCount = clampTargetCount(targetInput.value);
  targetInput.value = String(targetCount);
  renderPresetButtons(targetCount);

  if (activeTabId == null) {
    return;
  }

  await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.setTargetRequest,
    tabId: activeTabId,
    targetCount,
  });

  pushActivity(`Target updated to ${targetCount}.`);
});

for (const button of presetButtons) {
  button.addEventListener("click", async () => {
    const targetCount = clampTargetCount(button.dataset.targetPreset);
    targetInput.value = String(targetCount);
    renderTargetCount(targetCount);

    if (activeTabId == null) {
      return;
    }

    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.setTargetRequest,
      tabId: activeTabId,
      targetCount,
    });

    pushActivity(`Preset target ${targetCount} applied.`);
  });
}

startButton?.addEventListener("click", async () => {
  if (activeTabId == null) {
    return;
  }

  exportFeedback.textContent = "Starting crawler...";
  pushActivity("Start requested.");

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.startRequest,
      tabId: activeTabId,
      targetCount: clampTargetCount(targetInput.value),
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to start crawler");
    }

    exportFeedback.textContent = "Crawler started.";
  } catch (error) {
    exportFeedback.textContent = error.message;
    pushActivity(error.message);
  }
});

stopButton?.addEventListener("click", async () => {
  if (activeTabId == null) {
    return;
  }

  exportFeedback.textContent = "Stopping crawler...";
  pushActivity("Stop requested.");

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.stopRequest,
      tabId: activeTabId,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to stop crawler");
    }

    exportFeedback.textContent = "Crawler stop requested.";
  } catch (error) {
    exportFeedback.textContent = error.message;
    pushActivity(error.message);
  }
});

exportRawButton?.addEventListener("click", async () => {
  exportRawButton.disabled = true;
  exportFeedback.textContent = "Preparing raw JSON export...";
  pushActivity("Raw export requested.");

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.exportRawRequest,
      tabId: activeTabId,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Export failed");
    }

    exportFeedback.textContent = `Downloaded ${response.filename}`;
    pushActivity(`Downloaded ${response.filename}`);
  } catch (error) {
    exportFeedback.textContent = error.message;
    pushActivity(error.message);
  } finally {
    exportRawButton.disabled = false;
    renderEnrichment(currentEnrichment);
  }
});

exportEnrichedButton?.addEventListener("click", async () => {
  exportEnrichedButton.disabled = true;
  exportFeedback.textContent =
    currentEnrichment.readyForDownload
      ? "Downloading enriched JSON..."
      : "Starting author enrichment...";
  pushActivity(
    currentEnrichment.readyForDownload
      ? "Enriched export download requested."
      : "Enriched export requested.",
  );

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.exportEnrichedRequest,
      tabId: activeTabId,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Enriched export failed");
    }

    if (response?.ready) {
      exportFeedback.textContent = `Downloaded ${response.filename}`;
      pushActivity(`Downloaded ${response.filename}`);
    } else if (response?.started) {
      exportFeedback.textContent = "Author enrichment started.";
      pushActivity("Author enrichment started.");
    } else {
      exportFeedback.textContent = "Author enrichment is still running.";
      pushActivity("Author enrichment is still running.");
    }
  } catch (error) {
    exportFeedback.textContent = error.message;
    pushActivity(error.message);
  } finally {
    renderEnrichment(currentEnrichment);
  }
});

async function hydratePopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;

  if (activeTabId == null) {
    renderCount(0);
    renderRepostCount(0);
    renderWaitState(0);
    renderStatus("No active browser tab.", RUN_STATES.unavailable);
    renderTargetCount(TARGET_COUNT_DEFAULT);
    renderControls(RUN_STATES.unavailable);
    exportRawButton.disabled = true;
    exportEnrichedButton.disabled = true;
    pushActivity("No active browser tab.");
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.getState,
    tabId: activeTabId,
  });

  const state = response?.state || {};

  currentCount = state.count || 0;
  currentRepostCount = state.repostCount || 0;
  currentRunState = state.runState || RUN_STATES.idle;
  currentStalledWaitCount = state.stalledWaitCount || 0;
  currentStatus = state.status || "Waiting for LinkedIn feed...";
  currentEnrichment = state.enrichment || createEmptyEnrichmentState();

  renderCount(currentCount);
  renderRepostCount(currentRepostCount);
  renderWaitState(currentStalledWaitCount);
  renderStatus(currentStatus, currentRunState);
  renderTargetCount(state.targetCount || TARGET_COUNT_DEFAULT);
  renderControls(currentRunState);
  renderEnrichment(currentEnrichment);

  if (currentRunState === RUN_STATES.running) {
    pushActivity("Crawler is currently running.");
  } else {
    pushActivity(currentStatus);
  }
}

function renderCount(count) {
  currentCount = count;
  const targetCount = clampTargetCount(targetInput?.value);
  heroCountElement.textContent = String(count);
  heroTargetElement.textContent = String(targetCount);
}

function renderRepostCount(repostCount) {
  currentRepostCount = repostCount;
  repostCountElement.textContent = String(repostCount);
}

function renderWaitState(stalledWaitCount) {
  currentStalledWaitCount = stalledWaitCount;
  waitValueElement.textContent = `${stalledWaitCount} / ${STALLED_WAIT_LIMIT}`;
}

function renderStatus(status, runState) {
  currentStatus = status;
  currentRunState = runState;
  statusElement.textContent = status;
  modeValueElement.textContent = formatRunState(runState);
  statusBadgeElement.textContent = formatRunState(runState);
  statusBadgeElement.dataset.runState = runState;
}

function renderTargetCount(targetCount) {
  if (!targetInput) {
    return;
  }

  const clamped = clampTargetCount(targetCount);
  targetInput.value = String(clamped);
  renderPresetButtons(clamped);
  renderCount(currentCount);
}

function renderPresetButtons(targetCount) {
  for (const button of presetButtons) {
    const preset = clampTargetCount(button.dataset.targetPreset);
    button.classList.toggle("is-active", preset === targetCount);
  }
}

function renderControls(runState) {
  if (!targetInput || !startButton || !stopButton) {
    return;
  }

  const running =
    runState === RUN_STATES.running || runState === RUN_STATES.stopping;
  const unavailable = runState === RUN_STATES.unavailable;

  targetInput.disabled = running;
  for (const button of presetButtons) {
    button.disabled = running;
  }
  startButton.disabled = running || unavailable;
  stopButton.disabled = !running;
  exportRawButton.disabled = unavailable || activeTabId == null;
}

function renderEnrichment(enrichment) {
  currentEnrichment = {
    ...createEmptyEnrichmentState(),
    ...(enrichment || {}),
  };

  enrichmentStatusElement.textContent = formatEnrichmentStatus(
    currentEnrichment.status,
  );
  enrichmentPostsElement.textContent = `${currentEnrichment.processedPosts} / ${currentEnrichment.totalPosts}`;
  enrichmentAuthorsElement.textContent = `${currentEnrichment.processedAuthors} / ${currentEnrichment.totalAuthors}`;
  enrichmentCurrentElement.textContent =
    currentEnrichment.lastMessage ||
    (currentEnrichment.currentAuthor
      ? `Processing ${currentEnrichment.currentAuthor}.`
      : "No enrichment in progress.");

  if (currentEnrichment.readyForDownload) {
    exportEnrichedButton.textContent = "Download enriched";
    exportEnrichedButton.disabled = activeTabId == null;
    return;
  }

  exportEnrichedButton.textContent =
    currentEnrichment.status === ENRICHMENT_STATES.running
      ? "Enriching..."
      : "Export enriched";
  exportEnrichedButton.disabled =
    activeTabId == null || currentEnrichment.status === ENRICHMENT_STATES.running;
}

function pushActivity(message) {
  if (!message) {
    return;
  }

  if (activityItems[0] === message) {
    return;
  }

  activityItems = [message, ...activityItems].slice(0, ACTIVITY_LIMIT);
  renderActivityLog();
}

function renderActivityLog() {
  activityLog.innerHTML = "";

  for (const message of activityItems) {
    const item = document.createElement("li");
    item.textContent = message;
    activityLog.appendChild(item);
  }
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

function clampTargetCount(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return TARGET_COUNT_DEFAULT;
  }

  return Math.min(TARGET_COUNT_MAX, Math.max(TARGET_COUNT_MIN, parsed));
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
