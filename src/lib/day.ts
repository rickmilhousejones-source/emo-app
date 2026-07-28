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

export function formatDayLabel(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dayKey;
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${dayKey.slice(5).replace("-", "/")} · 周${weekdays[d.getDay()]}`;
}
