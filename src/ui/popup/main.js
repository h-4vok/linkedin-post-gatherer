import {
  MESSAGE_TYPES,
  RUN_STATES,
  TARGET_COUNT_DEFAULT,
  TARGET_COUNT_MAX,
  TARGET_COUNT_MIN,
} from "../../shared/constants.js";
import "./style.css";

const countElement = document.querySelector("#count");
const repostCountElement = document.querySelector("#repost-count");
const statusElement = document.querySelector("#status");
const targetInput = document.querySelector("#target-count");
const startButton = document.querySelector("#start-button");
const stopButton = document.querySelector("#stop-button");
const exportButton = document.querySelector("#export-button");
const exportFeedback = document.querySelector("#export-feedback");
let activeTabId = null;
let currentCount = 0;

void hydratePopup();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== MESSAGE_TYPES.countUpdated) {
    return;
  }

  if (message.tabId !== activeTabId) {
    return;
  }

  renderCount(message.count || 0);
  renderRepostCount(message.repostCount || 0);
  renderStatus(message.status || "Idle");
  renderTargetCount(message.targetCount || TARGET_COUNT_DEFAULT);
  renderControls(message.runState || RUN_STATES.idle);
});

targetInput?.addEventListener("change", async () => {
  const targetCount = clampTargetCount(targetInput.value);
  targetInput.value = String(targetCount);

  if (activeTabId == null) {
    return;
  }

  await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.setTargetRequest,
    tabId: activeTabId,
    targetCount,
  });
});

startButton?.addEventListener("click", async () => {
  if (activeTabId == null) {
    return;
  }

  exportFeedback.textContent = "Starting crawler...";

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
  }
});

stopButton?.addEventListener("click", async () => {
  if (activeTabId == null) {
    return;
  }

  exportFeedback.textContent = "Stopping crawler...";

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
  }
});

exportButton?.addEventListener("click", async () => {
  exportButton.disabled = true;
  exportFeedback.textContent = "Preparing JSON export...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.exportRequest,
      tabId: activeTabId,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Export failed");
    }

    exportFeedback.textContent = `Downloaded ${response.filename}`;
  } catch (error) {
    exportFeedback.textContent = error.message;
  } finally {
    exportButton.disabled = false;
  }
});

async function hydratePopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;

  if (activeTabId == null) {
  renderCount(0);
  renderStatus("No active browser tab.");
  renderTargetCount(TARGET_COUNT_DEFAULT);
  renderControls(RUN_STATES.unavailable);
  exportButton.disabled = true;
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.getState,
    tabId: activeTabId,
  });

  exportButton.disabled = false;
  renderCount(response?.state?.count || 0);
  renderRepostCount(response?.state?.repostCount || 0);
  renderStatus(response?.state?.status || "Waiting for LinkedIn feed...");
  renderTargetCount(response?.state?.targetCount || TARGET_COUNT_DEFAULT);
  renderControls(response?.state?.runState || RUN_STATES.idle);
}

function renderCount(count) {
  currentCount = count;
  const targetCount = clampTargetCount(targetInput?.value);
  countElement.textContent = `Posts identified: ${count} / ${targetCount}`;
}

function renderRepostCount(repostCount) {
  repostCountElement.textContent = `Reposts identified: ${repostCount}`;
}

function renderStatus(status) {
  statusElement.textContent = status;
}

function renderTargetCount(targetCount) {
  if (!targetInput) {
    return;
  }

  targetInput.value = String(clampTargetCount(targetCount));
  renderCount(currentCount);
}

function renderControls(runState) {
  if (!targetInput || !startButton || !stopButton) {
    return;
  }

  const running =
    runState === RUN_STATES.running || runState === RUN_STATES.stopping;
  const unavailable = runState === RUN_STATES.unavailable;

  targetInput.disabled = running;
  startButton.disabled = running || unavailable;
  stopButton.disabled = !running;
}

function clampTargetCount(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return TARGET_COUNT_DEFAULT;
  }

  return Math.min(TARGET_COUNT_MAX, Math.max(TARGET_COUNT_MIN, parsed));
}
