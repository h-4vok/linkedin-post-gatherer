import {
  LONG_WAIT_MS,
  NO_PROGRESS_LIMIT,
  RUN_STATES,
  STALLED_WAIT_LIMIT,
  STATUS_TEXT,
  TARGET_COUNT_DEFAULT,
  TARGET_COUNT_MAX,
  TARGET_COUNT_MIN,
} from "./constants.js";

export function clampTargetCount(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return TARGET_COUNT_DEFAULT;
  }

  return Math.min(TARGET_COUNT_MAX, Math.max(TARGET_COUNT_MIN, parsed));
}

export function getStartState(targetCount) {
  return {
    runState: RUN_STATES.running,
    status: STATUS_TEXT.scanning,
    targetCount: clampTargetCount(targetCount),
    noProgressCycles: 0,
    stalledWaitCount: 0,
    lastReason: null,
  };
}

export function getStoppedState(reason = "user") {
  return {
    runState: RUN_STATES.stopped,
    status: reason === "stalled" ? STATUS_TEXT.stalled : STATUS_TEXT.stopped,
    noProgressCycles: 0,
    stalledWaitCount: 0,
    lastReason: reason,
  };
}

export function getFeedState(currentRunState, feedFound) {
  if (!feedFound) {
    return {
      runState: RUN_STATES.unavailable,
      status: STATUS_TEXT.unavailable,
    };
  }

  if (
    currentRunState === RUN_STATES.running ||
    currentRunState === RUN_STATES.stopping ||
    currentRunState === RUN_STATES.unavailable
  ) {
    return {
      runState: RUN_STATES.idle,
      status: STATUS_TEXT.attached,
    };
  }

  return null;
}

export function getProgressState(
  currentState,
  {
    addedCount,
    totalCount,
    noProgressLimit = NO_PROGRESS_LIMIT,
    stalledWaitLimit = STALLED_WAIT_LIMIT,
  },
) {
  if (currentState.runState === RUN_STATES.stopping) {
    return {
      ...getStoppedState("user"),
      shouldStop: true,
      shouldLongWait: false,
      stopReason: "user",
    };
  }

  if (currentState.runState !== RUN_STATES.running) {
    return {
      runState: currentState.runState,
      status: currentState.status,
      noProgressCycles: currentState.noProgressCycles,
      stalledWaitCount: currentState.stalledWaitCount || 0,
      lastReason: currentState.lastReason || null,
      shouldStop: true,
      shouldLongWait: false,
      stopReason: "not-running",
    };
  }

  if (totalCount >= currentState.targetCount) {
    return {
      runState: RUN_STATES.completed,
      status: STATUS_TEXT.completed,
      noProgressCycles: 0,
      stalledWaitCount: 0,
      lastReason: "target-reached",
      shouldStop: true,
      shouldLongWait: false,
      stopReason: "target-reached",
    };
  }

  if (addedCount > 0) {
    return {
      runState: RUN_STATES.running,
      status: STATUS_TEXT.scanning,
      noProgressCycles: 0,
      stalledWaitCount: 0,
      lastReason: null,
      shouldStop: false,
      shouldLongWait: false,
      longWaitMs: 0,
      stopReason: null,
    };
  }

  const nextNoProgressCycles = currentState.noProgressCycles + 1;

  if (nextNoProgressCycles >= noProgressLimit) {
    const nextStalledWaitCount = (currentState.stalledWaitCount || 0) + 1;

    if (nextStalledWaitCount >= stalledWaitLimit) {
      return {
        ...getStoppedState("stalled"),
        shouldStop: true,
        shouldLongWait: false,
        stopReason: "stalled",
      };
    }

    return {
      runState: RUN_STATES.running,
      status: STATUS_TEXT.waitingForMore,
      noProgressCycles: 0,
      stalledWaitCount: nextStalledWaitCount,
      lastReason: "waiting-for-more",
      shouldStop: false,
      shouldLongWait: true,
      longWaitMs: LONG_WAIT_MS,
      stopReason: null,
    };
  }

  return {
    runState: RUN_STATES.running,
    status: STATUS_TEXT.scanning,
    noProgressCycles: nextNoProgressCycles,
    stalledWaitCount: currentState.stalledWaitCount || 0,
    lastReason: currentState.lastReason || null,
    shouldStop: false,
    shouldLongWait: false,
    longWaitMs: 0,
    stopReason: null,
  };
}
