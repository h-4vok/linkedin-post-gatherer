import { AI_DEFAULT_CONFIG, MESSAGE_TYPES } from "../../shared/constants.js";
import "./style.css";

const aiEnabledInput = document.querySelector("#ai-enabled");
const aiApiKeyInput = document.querySelector("#ai-api-key");
const aiModelInput = document.querySelector("#ai-model");
const aiSystemInstructionInput = document.querySelector(
  "#ai-system-instruction",
);
const saveAiConfigButton = document.querySelector("#save-ai-config");
const resetDebugButton = document.querySelector("#reset-debug-data");
const popupFeedback = document.querySelector("#popup-feedback");
const tabDebugStatus = document.querySelector("#tab-debug-status");

let activeTabId = null;
let activeTabUrl = "";

void hydratePopup();

saveAiConfigButton?.addEventListener("click", async () => {
  saveAiConfigButton.disabled = true;
  popupFeedback.textContent = "Saving AI config...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.setAiConfig,
      config: {
        enabled: aiEnabledInput.checked,
        apiKey: aiApiKeyInput.value,
        model: aiModelInput.value,
        systemInstruction: aiSystemInstructionInput.value,
      },
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to save AI config");
    }

    renderAiConfig(response.config);
    popupFeedback.textContent = "AI config saved.";
  } catch (error) {
    popupFeedback.textContent = error.message;
  } finally {
    saveAiConfigButton.disabled = false;
  }
});

resetDebugButton?.addEventListener("click", async () => {
  if (activeTabId == null || !isLinkedInTab(activeTabUrl)) {
    popupFeedback.textContent = "Open a LinkedIn feed tab before resetting debug data.";
    return;
  }

  resetDebugButton.disabled = true;
  popupFeedback.textContent = "Resetting current tab data...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.resetDebugRequest,
      tabId: activeTabId,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to reset current tab data");
    }

    popupFeedback.textContent =
      "Current tab data cleared. The LinkedIn panel can scan the same feed again.";
  } catch (error) {
    popupFeedback.textContent = error.message;
  } finally {
    resetDebugButton.disabled = false;
  }
});

async function hydratePopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  activeTabUrl = tab?.url || "";

  const aiConfigResponse = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.getAiConfig,
  });
  renderAiConfig(aiConfigResponse?.config || AI_DEFAULT_CONFIG);
  renderResetStatus();
}

function renderAiConfig(config) {
  aiEnabledInput.checked = Boolean(config?.enabled);
  aiApiKeyInput.value = config?.apiKey || "";
  aiModelInput.value = config?.model || AI_DEFAULT_CONFIG.model;
  aiSystemInstructionInput.value =
    config?.systemInstruction || AI_DEFAULT_CONFIG.systemInstruction;
}

function renderResetStatus() {
  if (activeTabId == null) {
    tabDebugStatus.textContent = "No active browser tab.";
    resetDebugButton.disabled = true;
    return;
  }

  if (!isLinkedInTab(activeTabUrl)) {
    tabDebugStatus.textContent =
      "The reset button only applies to an open LinkedIn tab with the injected panel.";
    resetDebugButton.disabled = true;
    return;
  }

  tabDebugStatus.textContent =
    "Reset clears captured posts, enriched export state and in-memory scan tracking for this LinkedIn tab.";
  resetDebugButton.disabled = false;
}

function isLinkedInTab(url) {
  return /^https:\/\/www\.linkedin\.com\//i.test(url || "");
}
