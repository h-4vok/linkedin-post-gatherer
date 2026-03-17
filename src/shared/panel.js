const DEFAULT_POSITION = {
  top: 96,
  right: 24,
};

const PANEL_SIZE = {
  expandedWidth: 320,
  expandedHeight: 430,
  minimizedWidth: 164,
  minimizedHeight: 52,
};

function ensureNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function getDefaultPanelPosition() {
  return { ...DEFAULT_POSITION };
}

export function clampPanelPosition(
  position,
  viewport = {},
  { minimized = false } = {},
) {
  const width = minimized ? PANEL_SIZE.minimizedWidth : PANEL_SIZE.expandedWidth;
  const height = minimized
    ? PANEL_SIZE.minimizedHeight
    : PANEL_SIZE.expandedHeight;
  const viewportWidth = ensureNumber(viewport.width, 1280);
  const viewportHeight = ensureNumber(viewport.height, 720);
  const maxRight = Math.max(12, viewportWidth - width - 12);
  const maxTop = Math.max(12, viewportHeight - height - 12);

  return {
    top: Math.min(
      Math.max(12, ensureNumber(position?.top, DEFAULT_POSITION.top)),
      maxTop,
    ),
    right: Math.min(
      Math.max(12, ensureNumber(position?.right, DEFAULT_POSITION.right)),
      maxRight,
    ),
  };
}

export function buildPanelStyles(position, { minimized = false } = {}) {
  return {
    top: `${position.top}px`,
    right: `${position.right}px`,
    width: minimized ? `${PANEL_SIZE.minimizedWidth}px` : "320px",
  };
}

export function createPanelMarkup() {
  return `
    <section class="harvester-shell harvester-expanded" data-state="expanded">
      <header class="harvester-header" data-drag-handle="true">
        <div>
          <p class="harvester-eyebrow">LinkedIn Intelligence Harvester</p>
          <h2 class="harvester-title">Harvester Console</h2>
        </div>
        <div class="harvester-header-actions">
          <span class="harvester-status-badge" data-run-state="idle">Idle</span>
          <button class="harvester-minimize" type="button" aria-label="Minimize panel">-</button>
        </div>
      </header>
      <div class="harvester-body">
        <section class="harvester-hero">
          <p class="harvester-hero-label">Accepted posts</p>
          <div class="harvester-hero-metric">
            <span class="harvester-hero-count">0</span>
            <span class="harvester-hero-separator">/</span>
            <span class="harvester-hero-target">50</span>
          </div>
          <p class="harvester-status">Waiting for LinkedIn feed...</p>
        </section>
        <div class="harvester-metrics">
          <article class="harvester-metric-card">
            <span class="harvester-metric-label">Reposts</span>
            <strong class="harvester-reposts">0</strong>
          </article>
          <article class="harvester-metric-card">
            <span class="harvester-metric-label">Mode</span>
            <strong class="harvester-mode">Idle</strong>
          </article>
          <article class="harvester-metric-card">
            <span class="harvester-metric-label">Long wait</span>
            <strong class="harvester-wait-count">0 / 3</strong>
          </article>
        </div>
        <div class="harvester-presets">
          <button class="harvester-preset" type="button" data-target-preset="25">25</button>
          <button class="harvester-preset" type="button" data-target-preset="50">50</button>
          <button class="harvester-preset" type="button" data-target-preset="100">100</button>
        </div>
        <div class="harvester-target-row">
          <label class="harvester-label">
            Target posts
            <input class="harvester-target" type="number" min="1" max="200" value="50" />
          </label>
          <button class="harvester-button harvester-start" type="button">Start</button>
        </div>
        <div class="harvester-actions">
          <button class="harvester-button harvester-stop" type="button">Stop</button>
          <button class="harvester-button harvester-export" type="button">Export</button>
        </div>
        <div class="harvester-activity">
          <p class="harvester-activity-label">Activity</p>
          <ul class="harvester-activity-log">
            <li>Waiting for LinkedIn feed...</li>
          </ul>
        </div>
        <p class="harvester-feedback" aria-live="polite" hidden></p>
      </div>
      <button class="harvester-chip" type="button" hidden>
        <span class="harvester-chip-label">Harvester</span>
        <span class="harvester-chip-count">0</span>
      </button>
    </section>
  `;
}

