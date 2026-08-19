import { describe, expect, it } from "vitest";

import {
  formatCompactNumber,
  formatDamage,
  formatPercent,
  formatRelativeTime,
} from "./format";

describe("number formatting", () => {
  it("uses stable raid damage suffixes", () => {
    expect(formatDamage(1_250_000_000_000)).toBe("1.3T");
    expect(formatDamage(50_501_000_000)).toBe("50.5B");
    expect(formatCompactNumber(980)).toBe("980");
    expect(formatCompactNumber(Number.NaN)).toBe("—");
  });

  it("formats percentages and unavailable values", () => {
    expect(formatPercent(12.345)).toBe("12.3%");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("relative time formatting", () => {
  const now = new Date("2026-08-19T03:20:00.000Z");

  it("formats recent timestamps without future-looking negatives", () => {
    expect(formatRelativeTime("2026-08-19T03:19:40.000Z", now)).toBe("방금 전");
    expect(formatRelativeTime("2026-08-19T03:18:00.000Z", now)).toBe("2분 전");
    expect(formatRelativeTime("2026-08-18T03:20:00.000Z", now)).toBe("1일 전");
    expect(formatRelativeTime("2026-08-20T03:20:00.000Z", now)).toBe("방금 전");
  });

  it("handles missing and malformed timestamps", () => {
    expect(formatRelativeTime(null, now)).toBe("동기화 전");
    expect(formatRelativeTime("not-a-date", now)).toBe("시간 정보 없음");
  });
});
