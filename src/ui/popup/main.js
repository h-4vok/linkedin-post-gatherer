import { MESSAGE_TYPES } from "../../shared/constants.js";
import "./style.css";

const countElement = document.querySelector("#count");
const repostCountElement = document.querySelector("#repost-count");
const statusElement = document.querySelector("#status");
const exportButton = document.querySelector("#export-button");
const exportFeedback = document.querySelector("#export-feedback");
let activeTabId = null;

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
    exportButton.disabled = true;
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.getState,
    tabId: activeTabId,
  });

  renderCount(response?.state?.count || 0);
  renderRepostCount(response?.state?.repostCount || 0);
  renderStatus(response?.state?.status || "Waiting for LinkedIn feed...");
}

function renderCount(count) {
  countElement.textContent = `Posts identified: ${count} / live`;
}

function renderRepostCount(repostCount) {
  repostCountElement.textContent = `Reposts identified: ${repostCount}`;
}

function renderStatus(status) {
  statusElement.textContent = status;
}
