import { MESSAGE_TYPES, STORAGE_KEYS } from "../../shared/constants.js";
import "./style.css";

const countElement = document.querySelector("#count");
const statusElement = document.querySelector("#status");
const exportButton = document.querySelector("#export-button");
const exportFeedback = document.querySelector("#export-feedback");

void hydratePopup();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[STORAGE_KEYS.count]) {
    renderCount(changes[STORAGE_KEYS.count].newValue || 0);
  }

  if (changes[STORAGE_KEYS.status]) {
    renderStatus(changes[STORAGE_KEYS.status].newValue || "Idle");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== MESSAGE_TYPES.countUpdated) {
    return;
  }

  renderCount(message.count || 0);
  renderStatus(message.status || "Idle");
});

exportButton?.addEventListener("click", async () => {
  exportButton.disabled = true;
  exportFeedback.textContent = "Preparing JSON export...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.exportRequest,
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
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.count,
    STORAGE_KEYS.status,
  ]);

  renderCount(stored[STORAGE_KEYS.count] || 0);
  renderStatus(stored[STORAGE_KEYS.status] || "Waiting for LinkedIn feed...");
}

function renderCount(count) {
  countElement.textContent = `Posts identified: ${count} / live`;
}

function renderStatus(status) {
  statusElement.textContent = status;
}
