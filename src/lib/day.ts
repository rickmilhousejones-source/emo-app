/** Day key helpers — natural day at midnight in device timezone */

export function dayKeyFromDate(date: Date, timeZone?: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function todayKey(timeZone?: string): string {
  return dayKeyFromDate(new Date(), timeZone);
}

/** Shift a YYYY-MM-DD key by whole calendar days (noon UTC anchor). */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const d = new Date(`${dayKey}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dayKey;
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function resolveDayKey(
  raw: string | null | undefined,
  today: string,
): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (t === "today" || t === "今天") return today;
  if (t === "yesterday" || t === "昨天") return shiftDayKey(today, -1);
  if (t === "day_before_yesterday" || t === "前天") return shiftDayKey(today, -2);
  return null;
}

export function formatDayLabel(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dayKey;
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${dayKey.slice(5).replace("-", "/")} · 周${weekdays[d.getDay()]}`;
}
