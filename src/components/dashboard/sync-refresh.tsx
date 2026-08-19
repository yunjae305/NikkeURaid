"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 5000;

export function SyncRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = globalThis.setInterval(() => {
      router.refresh();
    }, REFRESH_INTERVAL_MS);

    return () => globalThis.clearInterval(interval);
  }, [router]);

  return null;
}
