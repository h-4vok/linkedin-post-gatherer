export const FEED_SELECTOR =
  'div[componentkey="container-update-list_mainFeed-lazy-container"]';
export const POST_SELECTOR = 'div[role="listitem"]';
export const PROMOTED_LABELS = ["Promoted", "Publicidad"];
export const RELATIONSHIP_MARKERS = ["1st", "2nd", "3rd+", "Following"];
export const TARGET_COUNT_DEFAULT = 50;
export const TARGET_COUNT_MIN = 1;
export const TARGET_COUNT_MAX = 200;
export const NO_PROGRESS_LIMIT = 8;
export const STALLED_WAIT_LIMIT = 3;
export const LONG_WAIT_MS = 300000;
export const SCROLL_STEP_MIN = 400;
export const SCROLL_STEP_MAX = 600;
export const SCROLL_DELAY_MIN_MS = 1500;
export const SCROLL_DELAY_MAX_MS = 3500;

export const RUN_STATES = {
  idle: "idle",
  running: "running",
  stopping: "stopping",
  stopped: "stopped",
  completed: "completed",
  unavailable: "unavailable",
};

export const STORAGE_KEYS = {
  items: "collector.items",
  count: "collector.count",
  status: "collector.status",
  lastExportAt: "collector.lastExportAt",
  panelPosition: "collector.panel.position",
  panelMinimized: "collector.panel.minimized",
  authorCache: "collector.author-cache.v1",
};

export const MESSAGE_TYPES = {
  feedReady: "collector/feed-ready",
  newItems: "collector/new-items",
  countUpdated: "collector/count-updated",
  getState: "collector/get-state",
  setTargetRequest: "collector/set-target-request",
  startRequest: "collector/start-request",
  stopRequest: "collector/stop-request",
  crawlerCommand: "collector/crawler-command",
  crawlerProgress: "collector/crawler-progress",
  log: "collector/log",
  exportRawRequest: "collector/export-raw-request",
  exportEnrichedRequest: "collector/export-enriched-request",
  enrichmentCancelRequest: "collector/enrichment-cancel-request",
  profileExtractRequest: "collector/profile-extract-request",
  exportResult: "collector/export-result",
};

export const STATUS_TEXT = {
  idle: "Waiting for LinkedIn feed...",
  attached: "Ready to collect.",
  scanning: "Collector attached and scanning new posts.",
  stopping: "Stopping crawler.",
  stopped: "Stopped by user.",
  completed: "Target reached.",
  waitingForMore: "Waiting for more posts to load.",
  stalled: "Feed exhausted or stalled.",
  unavailable: "LinkedIn feed container not found on this view.",
};

export const ENRICHMENT_STATES = {
  idle: "idle",
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};
