import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  daySummaries,
  dimensionEntries,
  dimensions,
  messages,
} from "@/db/schema";
import { ensureSeeded } from "@/db/seed-data";
import { formatDayLabel } from "@/lib/day";

type Params = { params: Promise<{ day: string }> };

export async function GET(_request: Request, { params }: Params) {
  await ensureSeeded();
  const { day: dayKey } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return NextResponse.json({ error: "日期格式不对" }, { status: 400 });
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.dayKey, dayKey))
    .orderBy(asc(messages.createdAt));

  const entries = await db
    .select({
      id: dimensionEntries.id,
      phrase: dimensionEntries.phrase,
      silentScore: dimensionEntries.silentScore,
      source: dimensionEntries.source,
      dimName: dimensions.name,
      dimensionId: dimensionEntries.dimensionId,
      createdAt: dimensionEntries.createdAt,
    })
    .from(dimensionEntries)
    .leftJoin(dimensions, eq(dimensionEntries.dimensionId, dimensions.id))
    .where(eq(dimensionEntries.dayKey, dayKey))
    .orderBy(asc(dimensionEntries.createdAt));

  const [summary] = await db
    .select()
    .from(daySummaries)
    .where(eq(daySummaries.dayKey, dayKey))
    .limit(1);

  return NextResponse.json({
    dayKey,
    label: formatDayLabel(dayKey),
    oneLiner: summary?.oneLiner ?? null,
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
    entries,
  });
}
