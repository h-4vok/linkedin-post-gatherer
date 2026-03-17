const DEFAULT_POSITION = {
  top: 96,
  right: 24,
};

const PANEL_SIZE = {
  expandedWidth: 320,
  expandedHeight: 320,
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
          <h2 class="harvester-title">Current Batch</h2>
        </div>
        <button class="harvester-minimize" type="button" aria-label="Minimize panel">-</button>
      </header>
      <div class="harvester-body">
        <p class="harvester-status">Waiting for LinkedIn feed...</p>
        <div class="harvester-target-row">
          <label class="harvester-label">
            Target posts
            <input class="harvester-target" type="number" min="1" max="200" value="50" />
          </label>
          <button class="harvester-button harvester-start" type="button">Start</button>
        </div>
        <div class="harvester-actions">
          <button class="harvester-button harvester-stop" type="button">Stop</button>
          <button class="harvester-button harvester-export" type="button">Export JSON</button>
        </div>
        <p class="harvester-count">Posts identified: 0 / 50</p>
        <p class="harvester-reposts">Reposts identified: 0</p>
        <p class="harvester-feedback" aria-live="polite"></p>
      </div>
      <button class="harvester-chip" type="button" hidden>
        Harvester <span class="harvester-chip-count">0</span>
      </button>
    </section>
  `;
}

