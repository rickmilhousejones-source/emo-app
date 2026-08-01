import { NextResponse } from "next/server";
import { desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { daySummaries, dimensionEntries, dimensions } from "@/db/schema";
import { ensureSeeded } from "@/db/seed-data";
import { dayKeyFromDate, formatDayLabel, todayKey } from "@/lib/day";

export async function GET(request: Request) {
  await ensureSeeded();
  const url = new URL(request.url);
  const tz = url.searchParams.get("tz") || undefined;
  const days = Math.min(Number(url.searchParams.get("days") || 14), 60);
  const end = todayKey(tz);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));
  const start = dayKeyFromDate(startDate, tz);

  const chartDims = ["anxiety", "mood"];
  const entries = await db
    .select({
      dayKey: dimensionEntries.dayKey,
      dimensionId: dimensionEntries.dimensionId,
      phrase: dimensionEntries.phrase,
      silentScore: dimensionEntries.silentScore,
      period: dimensionEntries.period,
      createdAt: dimensionEntries.createdAt,
      dimName: dimensions.name,
    })
    .from(dimensionEntries)
    .leftJoin(dimensions, eq(dimensionEntries.dimensionId, dimensions.id))
    .where(gte(dimensionEntries.dayKey, start))
    .orderBy(desc(dimensionEntries.createdAt));

  const summaries = await db
    .select()
    .from(daySummaries)
    .where(gte(daySummaries.dayKey, start))
    .orderBy(desc(daySummaries.dayKey));

  const summaryMap = new Map(summaries.map((s) => [s.dayKey, s.oneLiner]));

  // Build day list; chart: mean of per-period scores (legacy null period = one bucket)
  const byDay = new Map<
    string,
    {
      phrases: string[];
      dims: string[];
      /** dimId -> periodKey -> score (latest wins while iterating desc) */
      periodScores: Record<string, Record<string, number>>;
    }
  >();

  for (const e of entries) {
    if (!byDay.has(e.dayKey)) {
      byDay.set(e.dayKey, { phrases: [], dims: [], periodScores: {} });
    }
    const bucket = byDay.get(e.dayKey)!;
    if (bucket.phrases.length < 3) bucket.phrases.push(e.phrase);
    if (e.dimName && !bucket.dims.includes(e.dimName)) {
      bucket.dims.push(e.dimName);
    }
    if (e.silentScore != null && chartDims.includes(e.dimensionId)) {
      if (!bucket.periodScores[e.dimensionId]) {
        bucket.periodScores[e.dimensionId] = {};
      }
      // desc createdAt: first write for a real period = latest
      if (e.period) {
        if (bucket.periodScores[e.dimensionId][e.period] == null) {
          bucket.periodScores[e.dimensionId][e.period] = e.silentScore;
        }
      } else {
        const pk = `_legacy_${String(e.createdAt)}`;
        bucket.periodScores[e.dimensionId][pk] = e.silentScore;
      }
    }
  }

  // Fill chart series for each day in range
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayKeys.push(dayKeyFromDate(d, tz));
  }

  const series = chartDims.map((id) => ({
    id,
    name: id === "anxiety" ? "焦虑" : "心情",
    points: dayKeys.map((dk) => {
      const map = byDay.get(dk)?.periodScores[id];
      const scores = map ? Object.values(map) : [];
      if (!scores.length) return { dayKey: dk, value: null as number | null };
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return { dayKey: dk, value: Math.round(avg * 10) / 10 };
    }),
  }));

  const recentDays = [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 21)
    .map(([dayKey, info]) => ({
      dayKey,
      label: formatDayLabel(dayKey),
      oneLiner:
        summaryMap.get(dayKey) ||
        info.phrases[0] ||
        "有过记录",
      dims: info.dims.join(" · "),
      phrases: info.phrases,
    }));

  // Also include days that only have summaries
  for (const s of summaries) {
    if (!recentDays.find((d) => d.dayKey === s.dayKey)) {
      recentDays.push({
        dayKey: s.dayKey,
        label: formatDayLabel(s.dayKey),
        oneLiner: s.oneLiner,
        dims: "",
        phrases: [],
      });
    }
  }
  recentDays.sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));

  return NextResponse.json({
    end,
    start,
    series,
    days: recentDays.slice(0, 21),
  });
}
