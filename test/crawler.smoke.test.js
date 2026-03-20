import { describe, expect, it } from "vitest";
import {
  clampTargetCount,
  getFeedState,
  getProgressState,
  getStartState,
  getStoppedState,
} from "../src/shared/crawler.js";
import { LONG_WAIT_MS, RUN_STATES, STATUS_TEXT } from "../src/shared/constants.js";

describe("crawler helpers", () => {
  it("clamps target count into the supported range", () => {
    expect(clampTargetCount(0)).toBe(1);
    expect(clampTargetCount(500)).toBe(200);
    expect(clampTargetCount("25")).toBe(25);
  });

  it("starts in running mode with a normalized target", () => {
    expect(getStartState(999)).toMatchObject({
      runState: RUN_STATES.running,
      status: STATUS_TEXT.scanning,
      targetCount: 200,
      noProgressCycles: 0,
    });
  });

  it("creates stopped states for user and stall reasons", () => {
    expect(getStoppedState("user")).toMatchObject({
      runState: RUN_STATES.stopped,
      status: STATUS_TEXT.stopped,
      lastReason: "user",
    });
    expect(getStoppedState("stalled")).toMatchObject({
      runState: RUN_STATES.stopped,
      status: STATUS_TEXT.stalled,
      lastReason: "stalled",
    });
  });

  it("marks the feed unavailable or ready without resuming a stale run", () => {
    expect(getFeedState(RUN_STATES.idle, false)).toEqual({
      runState: RUN_STATES.unavailable,
      status: STATUS_TEXT.unavailable,
    });
    expect(getFeedState(RUN_STATES.running, true)).toEqual({
      runState: RUN_STATES.idle,
      status: STATUS_TEXT.attached,
    });
  });

  it("stops when the target is reached", () => {
    expect(
      getProgressState(
        {
          runState: RUN_STATES.running,
          status: STATUS_TEXT.scanning,
          targetCount: 5,
          noProgressCycles: 0,
          lastReason: null,
        },
        {
          addedCount: 1,
          totalCount: 5,
        },
      ),
    ).toMatchObject({
      runState: RUN_STATES.completed,
      status: STATUS_TEXT.completed,
      shouldStop: true,
      stopReason: "target-reached",
    });
  });

  it("schedules a long wait after the no-progress threshold", () => {
    expect(
      getProgressState(
        {
          runState: RUN_STATES.running,
          status: STATUS_TEXT.scanning,
          targetCount: 50,
          noProgressCycles: 7,
          stalledWaitCount: 0,
          lastReason: null,
        },
        {
          addedCount: 0,
          totalCount: 12,
        },
      ),
    ).toMatchObject({
      runState: RUN_STATES.running,
      status: STATUS_TEXT.waitingForMore,
      noProgressCycles: 0,
      stalledWaitCount: 1,
      shouldStop: false,
      shouldLongWait: true,
      longWaitMs: LONG_WAIT_MS,
    });
  });

  it("uses the shorter 20 second long wait", () => {
    expect(LONG_WAIT_MS).toBe(20000);
  });

  it("stops only after repeated long waits without progress", () => {
    expect(
      getProgressState(
        {
          runState: RUN_STATES.running,
          status: STATUS_TEXT.waitingForMore,
          targetCount: 50,
          noProgressCycles: 7,
          stalledWaitCount: 2,
          lastReason: "waiting-for-more",
        },
        {
          addedCount: 0,
          totalCount: 12,
        },
      ),
    ).toMatchObject({
      runState: RUN_STATES.stopped,
      status: STATUS_TEXT.stalled,
      shouldStop: true,
      stopReason: "stalled",
    });
  });

  it("finalizes a pending stop request on the next progress check", () => {
    expect(
      getProgressState(
        {
          runState: RUN_STATES.stopping,
          status: STATUS_TEXT.stopping,
          targetCount: 50,
          noProgressCycles: 0,
          lastReason: "user",
        },
        {
          addedCount: 0,
          totalCount: 10,
        },
      ),
    ).toMatchObject({
      runState: RUN_STATES.stopped,
      status: STATUS_TEXT.stopped,
      shouldStop: true,
      stopReason: "user",
    });
  });
});
