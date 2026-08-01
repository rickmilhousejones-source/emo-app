/** Time-of-day periods in the user's local timezone */

export const PERIOD_IDS = [
  "morning",
  "forenoon",
  "noon",
  "afternoon",
  "evening",
  "night",
] as const;

export type PeriodId = (typeof PERIOD_IDS)[number];

const LABELS: Record<PeriodId, string> = {
  morning: "早上",
  forenoon: "上午",
  noon: "中午",
  afternoon: "下午",
  evening: "晚上",
  night: "深夜",
};

const LABEL_TO_ID = new Map<string, PeriodId>(
  Object.entries(LABELS).map(([id, label]) => [label, id as PeriodId]),
);

export function periodLabel(period: PeriodId | null | undefined): string {
  if (!period) return "整天";
  return LABELS[period] || period;
}

export function parsePeriodId(
  raw: string | null | undefined,
): PeriodId | null {
  if (!raw) return null;
  const t = raw.trim();
  if ((PERIOD_IDS as readonly string[]).includes(t)) return t as PeriodId;
  return LABEL_TO_ID.get(t) || null;
}

/** Hour 0–23 in timezone → period */
export function periodFromHour(hour: number): PeriodId {
  if (hour >= 5 && hour < 9) return "morning";
  if (hour >= 9 && hour < 12) return "forenoon";
  if (hour >= 12 && hour < 14) return "noon";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 24) return "evening";
  return "night";
}

export function localHour(date: Date, timeZone?: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone || undefined,
      hour: "numeric",
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const h = parts.find((p) => p.type === "hour")?.value;
    let n = Number(h);
    // Some environments use 24 for midnight
    if (n === 24) n = 0;
    return Number.isFinite(n) ? n : date.getHours();
  } catch {
    return date.getHours();
  }
}

export function periodFromDate(date: Date, timeZone?: string): PeriodId {
  return periodFromHour(localHour(date, timeZone));
}

export function formatLocalNowLabel(date: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}
