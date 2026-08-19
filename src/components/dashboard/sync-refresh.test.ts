import { afterEach, describe, expect, it, vi } from "vitest";

import { startSyncPolling } from "./sync-refresh";

afterEach(() => {
  vi.useRealTimers();
});

describe("startSyncPolling", () => {
  it("refreshes on schedule, stops at the timeout, and exposes retry state", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const onTimeout = vi.fn();
    const cleanup = startSyncPolling(refresh, onTimeout, 5_000, 12_000);

    vi.advanceTimersByTime(11_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(onTimeout).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(2);

    cleanup();
  });

  it("cleans up both timers when the syncing view unmounts", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const onTimeout = vi.fn();
    const cleanup = startSyncPolling(refresh, onTimeout, 5_000, 12_000);

    cleanup();
    vi.runAllTimers();

    expect(refresh).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
