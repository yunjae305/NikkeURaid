"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export const SYNC_REFRESH_INTERVAL_MS = 5000;
export const SYNC_REFRESH_TIMEOUT_MS = 120_000;

export function startSyncPolling(
  refresh: () => void,
  onTimeout: () => void,
  intervalMs = SYNC_REFRESH_INTERVAL_MS,
  timeoutMs = SYNC_REFRESH_TIMEOUT_MS,
) {
  const interval = globalThis.setInterval(refresh, intervalMs);
  const timeout = globalThis.setTimeout(() => {
    globalThis.clearInterval(interval);
    onTimeout();
  }, timeoutMs);

  return () => {
    globalThis.clearInterval(interval);
    globalThis.clearTimeout(timeout);
  };
}

export function SyncRefresh() {
  const router = useRouter();
  const [cycle, setCycle] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    return startSyncPolling(
      () => router.refresh(),
      () => setTimedOut(true),
    );
  }, [router, cycle]);

  if (!timedOut) return null;

  return (
    <div className="status-timeout" aria-live="polite">
      <span>자동 확인을 잠시 멈췄습니다.</span>
      <button
        className="status-action"
        type="button"
        onClick={() => {
          setTimedOut(false);
          setCycle((value) => value + 1);
          router.refresh();
        }}
      >
        다시 확인
      </button>
    </div>
  );
}
