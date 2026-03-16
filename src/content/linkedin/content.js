import {
  findFeedContainer,
  findPostElements,
  scanFeedPosts,
} from "../../shared/extractor.js";

const MESSAGE_TYPES = {
  feedReady: "collector/feed-ready",
  newItems: "collector/new-items",
};

const STATUS_TEXT = {
  attached: "Collector attached to LinkedIn feed.",
  unavailable: "LinkedIn feed container not found on this view.",
};

const STORAGE_KEYS = {
  status: "collector.status",
};

const processedElements = new WeakSet();
let feedObserver = null;
let rootObserver = null;
let pendingScan = false;

bootstrapCollector();

function bootstrapCollector() {
  attachToFeedIfPresent();

  rootObserver = new MutationObserver(() => {
    attachToFeedIfPresent();
  });

  if (document.body) {
    rootObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}

function attachToFeedIfPresent() {
  const feedContainer = findFeedContainer(document);

  if (!feedContainer) {
    console.log("[harvester] feed container not found yet");
    void chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.feedReady,
      feedFound: false,
    });
    void chrome.storage.local.set({
      [STORAGE_KEYS.status]: STATUS_TEXT.unavailable,
    });
    return;
  }

  if (feedObserver && feedObserver.feedContainer === feedContainer) {
    return;
  }

  if (feedObserver) {
    feedObserver.disconnect();
  }

  feedObserver = new MutationObserver(() => scheduleScan(feedContainer));
  feedObserver.feedContainer = feedContainer;
  feedObserver.observe(feedContainer, {
    childList: true,
    subtree: true,
  });

  console.log("[harvester] feed container attached", {
    listItemsInView: findPostElements(feedContainer).length,
  });

  void chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.feedReady,
    feedFound: true,
  });
  void chrome.storage.local.set({
    [STORAGE_KEYS.status]: STATUS_TEXT.attached,
  });

  scheduleScan(feedContainer);
}

function scheduleScan(feedContainer) {
  if (pendingScan) {
    return;
  }

  pendingScan = true;

  queueMicrotask(() => {
    pendingScan = false;
    runScan(feedContainer);
  });
}

function runScan(feedContainer) {
  const totalListItems = findPostElements(feedContainer).length;
  const { acceptedItems, skippedItems } = scanFeedPosts(feedContainer, {
    processedElements,
  });

  console.log("[harvester] scan complete", {
    totalListItems,
    accepted: acceptedItems.length,
    skipped: skippedItems.length,
  });

  for (const item of acceptedItems) {
    const { fingerprint, ...loggable } = item;
    console.log("[harvester] item found", loggable);
  }

  for (const reason of skippedItems) {
    if (reason === "missing-author") {
      console.log("[harvester] skipped item", { reason });
    }
  }

  if (!acceptedItems.length) {
    return;
  }

  void chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.newItems,
    items: acceptedItems,
  });
}
