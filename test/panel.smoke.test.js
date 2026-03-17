import { describe, expect, it } from "vitest";
import {
  buildPanelStyles,
  clampPanelPosition,
  createPanelMarkup,
  getDefaultPanelPosition,
} from "../src/shared/panel.js";

describe("floating panel helpers", () => {
  it("returns a stable default position", () => {
    expect(getDefaultPanelPosition()).toEqual({ top: 96, right: 24 });
  });

  it("clamps expanded position into the viewport", () => {
    expect(
      clampPanelPosition(
        { top: -50, right: 5000 },
        { width: 1200, height: 800 },
        { minimized: false },
      ),
    ).toEqual({ top: 12, right: 868 });
  });

  it("clamps minimized position using minimized bounds", () => {
    expect(
      clampPanelPosition(
        { top: 999, right: 999 },
        { width: 600, height: 400 },
        { minimized: true },
      ),
    ).toEqual({ top: 336, right: 424 });
  });

  it("builds inline styles from a clamped position", () => {
    expect(
      buildPanelStyles({ top: 120, right: 48 }, { minimized: false }),
    ).toEqual({
      top: "120px",
      right: "48px",
      width: "320px",
    });
  });

  it("creates markup with minimized chip and controls", () => {
    const markup = createPanelMarkup();

    expect(markup).toContain("harvester-header");
    expect(markup).toContain("harvester-export");
    expect(markup).toContain("harvester-start");
    expect(markup).toContain("harvester-stop");
    expect(markup).toContain("harvester-status-badge");
    expect(markup).toContain("harvester-activity-log");
    expect(markup).toContain("data-target-preset");
    expect(markup).toContain('type="number"');
    expect(markup).toContain("harvester-chip");
  });
});
