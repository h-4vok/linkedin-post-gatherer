import { AI_DEFAULT_CONFIG, MESSAGE_TYPES } from "../../shared/constants.js";
import "./style.css";

const aiEnabledInput = document.querySelector("#ai-enabled");
const aiApiKeyInput = document.querySelector("#ai-api-key");
const aiModelInput = document.querySelector("#ai-model");
const aiSystemInstructionInput = document.querySelector("#ai-system-instruction");
const saveAiConfigButton = document.querySelector("#save-ai-config");
const resetDebugButton = document.querySelector("#reset-debug-data");
const captureFeedDumpButton = document.querySelector("#capture-feed-dump");
const previewIgnoredButton = document.querySelector("#preview-ignored-json");
const previewRawButton = document.querySelector("#preview-json-raw");
const previewEnrichedButton = document.querySelector("#preview-json-enriched");
const popupFeedback = document.querySelector("#popup-feedback");
const tabDebugStatus = document.querySelector("#tab-debug-status");
const previewDialog = document.querySelector("#preview-dialog");
const previewKind = document.querySelector("#preview-kind");
const previewTitle = document.querySelector("#preview-title");
const previewMeta = document.querySelector("#preview-meta");
const previewOutput = document.querySelector("#preview-output");
const previewCopyButton = document.querySelector("#preview-copy");

let activeTabId = null;
let activeTabUrl = "";
let activeState = null;

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

captureFeedDumpButton?.addEventListener("click", async () => {
  await openFeedDumpPreview();
});

previewIgnoredButton?.addEventListener("click", async () => {
  await openIgnoredPreview();
});

previewRawButton?.addEventListener("click", async () => {
  await openExportPreview("raw");
});

previewEnrichedButton?.addEventListener("click", async () => {
  await openExportPreview("enriched");
});

previewCopyButton?.addEventListener("click", async () => {
  await copyPreviewText();
});

previewDialog?.addEventListener("close", () => {
  previewOutput.value = "";
});

async function hydratePopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  activeTabUrl = tab?.url || "";

  const aiConfigResponse = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.getAiConfig,
  });
  renderAiConfig(aiConfigResponse?.config || AI_DEFAULT_CONFIG);
  await refreshActiveState();
  renderResetStatus();
  renderDebugToolState();
}

function renderAiConfig(config) {
  aiEnabledInput.checked = Boolean(config?.enabled);
  aiApiKeyInput.value = config?.apiKey || "";
  aiModelInput.value = config?.model || AI_DEFAULT_CONFIG.model;
  aiSystemInstructionInput.value = config?.systemInstruction || AI_DEFAULT_CONFIG.systemInstruction;
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

async function refreshActiveState() {
  if (activeTabId == null) {
    activeState = null;
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.getState,
    tabId: activeTabId,
  });

  activeState = response?.state || null;
}

function renderDebugToolState() {
  const isLinkedIn = activeTabId != null && isLinkedInTab(activeTabUrl);
  const canPreviewRaw = Boolean(activeState);
  const canPreviewIgnored = Boolean(activeState?.ignoredSamples?.length);
  const canPreviewEnriched =
    activeState?.enrichment?.status === "completed" && activeState?.enrichment?.readyForDownload;

  if (captureFeedDumpButton) {
    captureFeedDumpButton.disabled = !isLinkedIn;
  }

  if (previewRawButton) {
    previewRawButton.disabled = !canPreviewRaw;
  }

  if (previewIgnoredButton) {
    previewIgnoredButton.disabled = !canPreviewIgnored;
  }

  if (previewEnrichedButton) {
    previewEnrichedButton.disabled = !canPreviewEnriched;
  }
}

async function openFeedDumpPreview() {
  if (activeTabId == null || !isLinkedInTab(activeTabUrl)) {
    popupFeedback.textContent = "Open a LinkedIn feed tab before capturing a dump.";
    return;
  }

  captureFeedDumpButton.disabled = true;
  popupFeedback.textContent = "Capturing feed DOM dump...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.debugFeedDumpRequest,
      tabId: activeTabId,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to capture feed dump");
    }

    const json = JSON.stringify(response.dump, null, 2);
    openPreviewModal({
      kind: "DOM dump",
      title: "LinkedIn feed dump",
      meta: response.dump?.error
        ? "Feed not found."
        : `Captured ${response.dump?.posts?.length || 0} post samples.`,
      text: json,
    });
    popupFeedback.textContent = "Feed dump captured.";
  } catch (error) {
    popupFeedback.textContent = error.message;
  } finally {
    renderDebugToolState();
  }
}

async function openExportPreview(mode) {
  if (activeTabId == null) {
    popupFeedback.textContent = "Open a tab with collected data before previewing JSON.";
    return;
  }

  popupFeedback.textContent =
    mode === "enriched" ? "Preparing enriched JSON preview..." : "Preparing raw JSON preview...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.exportPreviewRequest,
      tabId: activeTabId,
      mode,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to build preview");
    }

    openPreviewModal({
      kind: response.mode === "enriched" ? "Enriched JSON" : "Raw JSON",
      title: response.mode === "enriched" ? "Export preview - enriched" : "Export preview - raw",
      meta: `${response.count || 0} items ready for preview.`,
      text: response.json,
    });
    popupFeedback.textContent = "JSON preview ready.";
  } catch (error) {
    popupFeedback.textContent = error.message;
  } finally {
    renderDebugToolState();
  }
}

async function openIgnoredPreview() {
  if (activeTabId == null) {
    popupFeedback.textContent = "Open a tab with collected data before previewing ignored posts.";
    return;
  }

  popupFeedback.textContent = "Preparing ignored-posts JSON preview...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.debugIgnoredSamplesRequest,
      tabId: activeTabId,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to build ignored-posts preview");
    }

    openPreviewModal({
      kind: "Ignored posts JSON",
      title: "Debug preview - ignored posts",
      meta: `${response.count || 0} discarded samples ready for inspection.`,
      text: response.json,
    });
    popupFeedback.textContent = "Ignored-posts preview ready.";
  } catch (error) {
    popupFeedback.textContent = error.message;
  } finally {
    renderDebugToolState();
  }
}

function openPreviewModal({ kind, title, meta, text }) {
  previewKind.textContent = kind;
  previewTitle.textContent = title;
  previewMeta.textContent = meta || "";
  previewOutput.value = text || "";

  if (previewDialog?.open) {
    previewDialog.close();
  }

  if (typeof previewDialog?.showModal === "function") {
    previewDialog.showModal();
  } else {
    previewDialog.setAttribute("open", "");
  }

  previewOutput.focus();
  previewOutput.select();
}

async function copyPreviewText() {
  const text = previewOutput.value || "";

  if (!text) {
    popupFeedback.textContent = "Nothing to copy.";
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    popupFeedback.textContent = "Preview copied to clipboard.";
  } catch {
    previewOutput.focus();
    previewOutput.select();
    popupFeedback.textContent = "Copy failed. Use manual copy from the preview.";
  }
}

function isLinkedInTab(url) {
  return /^https:\/\/www\.linkedin\.com\//i.test(url || "");
}
