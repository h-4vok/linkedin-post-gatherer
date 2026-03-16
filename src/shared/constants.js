export const FEED_SELECTOR =
  'div[componentkey="container-update-list_mainFeed-lazy-container"]';
export const POST_SELECTOR = 'div[role="listitem"]';
export const PROMOTED_LABELS = ["Promoted", "Publicidad"];
export const RELATIONSHIP_MARKERS = ["1st", "2nd", "3rd+", "Following"];

export const STORAGE_KEYS = {
  items: "collector.items",
  count: "collector.count",
  status: "collector.status",
  lastExportAt: "collector.lastExportAt",
};

export const MESSAGE_TYPES = {
  feedReady: "collector/feed-ready",
  newItems: "collector/new-items",
  countUpdated: "collector/count-updated",
  exportRequest: "collector/export-request",
  exportResult: "collector/export-result",
};

export const STATUS_TEXT = {
  idle: "Waiting for LinkedIn feed...",
  attached: "Collector attached to LinkedIn feed.",
  scanning: "Collector attached and scanning new posts.",
  unavailable: "LinkedIn feed container not found on this view.",
};
