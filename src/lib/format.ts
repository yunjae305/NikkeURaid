const compactFormatters = new Map<number, Intl.NumberFormat>();

function formatter(maximumFractionDigits: number): Intl.NumberFormat {
  const cached = compactFormatters.get(maximumFractionDigits);
  if (cached) return cached;

  const created = new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  });
  compactFormatters.set(maximumFractionDigits, created);
  return created;
}

export function formatCompactNumber(
  value: number,
  maximumFractionDigits = 1,
): string {
  if (!Number.isFinite(value)) return "—";

  const absolute = Math.abs(value);
  const units = [
    { threshold: 1_000_000_000_000, suffix: "T" },
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ] as const;
  const unit = units.find(({ threshold }) => absolute >= threshold);

  if (!unit) return formatter(0).format(value);
  return `${formatter(maximumFractionDigits).format(value / unit.threshold)}${unit.suffix}`;
}

export function formatDamage(value: number): string {
  return formatCompactNumber(value, 1);
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${formatter(digits).format(value)}%`;
}

export function formatRelativeTime(
  isoTimestamp: string | null,
  now = new Date(),
): string {
  if (!isoTimestamp) return "동기화 전";

  const timestamp = new Date(isoTimestamp);
  if (Number.isNaN(timestamp.getTime())) return "시간 정보 없음";

  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - timestamp.getTime()) / 1_000),
  );

  if (seconds < 60) return "방금 전";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}
