import { DEFAULT_GEMINI_SYSTEM_INSTRUCTION } from "../background/default-system-instruction.js";

export const FEED_SELECTOR =
  'div[componentkey="container-update-list_mainFeed-lazy-container"]';
export const POST_SELECTOR = 'div[role="listitem"]';
export const PROMOTED_LABELS = ["Promoted", "Publicidad"];
export const SUGGESTED_LABELS = ["Suggested", "Sugerido"];
export const RELATIONSHIP_MARKERS = ["1st", "2nd", "3rd+", "Following"];
export const TARGET_COUNT_DEFAULT = 50;
export const TARGET_COUNT_MIN = 1;
export const TARGET_COUNT_MAX = 200;
export const NO_PROGRESS_LIMIT = 8;
export const STALLED_WAIT_LIMIT = 3;
export const LONG_WAIT_MS = 20000;
export const SCROLL_STEP_MIN = 400;
export const SCROLL_STEP_MAX = 600;
export const SCROLL_DELAY_MIN_MS = 1500;
export const SCROLL_DELAY_MAX_MS = 3500;
export const AI_VALIDATION_SOURCE = "gemini";
export const AI_STATUS = {
  pending: "pending",
  interested: "interesa",
  notInterested: "no_interesa",
  unknown: "unknown",
};
export const AI_QUEUE_PHASES = {
  idle: "idle",
  processing: "processing",
  backingOff: "backing-off",
  disabled: "disabled",
  configError: "config-error",
};
export const AI_RATE_LIMIT = {
  baseDelayMs: 4000,
  defaultBackoffMs: 15000,
  quotaCooldownMs: 60000,
  maxAttempts: 3,
};
export const AI_DEFAULT_CONFIG = {
  enabled: false,
  apiKey: "",
  model: "gemini-2.0-flash",
  systemInstruction: DEFAULT_GEMINI_SYSTEM_INSTRUCTION,
};

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
  aiConfig: "collector.ai.config",
};

export const MESSAGE_TYPES = {
  feedReady: "collector/feed-ready",
  newItems: "collector/new-items",
  countUpdated: "collector/count-updated",
  getState: "collector/get-state",
  resetDebugRequest: "collector/reset-debug-request",
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
  getAiConfig: "collector/get-ai-config",
  setAiConfig: "collector/set-ai-config",
  aiStatusUpdated: "collector/ai-status-updated",
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
