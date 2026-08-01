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
import { upsertPeriodEntry } from "@/lib/entries";
import { parsePeriodId, type PeriodId } from "@/lib/period";
import { generateDaySummary } from "@/lib/summary";

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
      period: dimensionEntries.period,
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

  const allDims = await db
    .select({
      id: dimensions.id,
      name: dimensions.name,
      enabled: dimensions.enabled,
    })
    .from(dimensions)
    .orderBy(asc(dimensions.sortOrder));

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
    dimensions: allDims.filter((d) => d.enabled),
  });
}

type PatchBody = {
  oneLiner?: string | null;
  regenerateSummary?: boolean;
  deleteEntryIds?: string[];
  upserts?: {
    id?: string | null;
    dimensionId: string;
    phrase: string;
    silentScore?: number | null;
    period?: string | null;
  }[];
};

export async function PATCH(request: Request, { params }: Params) {
  await ensureSeeded();
  const { day: dayKey } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return NextResponse.json({ error: "日期格式不对" }, { status: 400 });
  }

  const body = (await request.json()) as PatchBody;
  let changed = false;

  for (const id of body.deleteEntryIds || []) {
    if (!id) continue;
    await db.delete(dimensionEntries).where(eq(dimensionEntries.id, id));
    changed = true;
  }

  for (const u of body.upserts || []) {
    const phrase = (u.phrase || "").trim().slice(0, 120);
    if (!u.dimensionId || !phrase) continue;
    const period = parsePeriodId(u.period ?? undefined);

    if (u.id) {
      const [existing] = await db
        .select()
        .from(dimensionEntries)
        .where(eq(dimensionEntries.id, u.id))
        .limit(1);
      if (existing && existing.dayKey === dayKey) {
        await db
          .update(dimensionEntries)
          .set({
            phrase,
            silentScore:
              typeof u.silentScore === "number" ? u.silentScore : null,
            period: period ?? existing.period,
            source: "edit",
            viaAi: false,
            createdAt: new Date(),
          })
          .where(eq(dimensionEntries.id, u.id));
        changed = true;
        continue;
      }
    }

    if (period) {
      await upsertPeriodEntry({
        dayKey,
        period: period as PeriodId,
        dimensionId: u.dimensionId,
        phrase,
        silentScore: typeof u.silentScore === "number" ? u.silentScore : null,
        source: "edit",
        viaAi: false,
      });
      changed = true;
    } else {
      // Manual whole-day / legacy-style row
      const id = crypto.randomUUID();
      await db.insert(dimensionEntries).values({
        id,
        dayKey,
        period: null,
        dimensionId: u.dimensionId,
        phrase,
        silentScore: typeof u.silentScore === "number" ? u.silentScore : null,
        source: "edit",
        viaAi: false,
      });
      changed = true;
    }
  }

  if (typeof body.oneLiner === "string") {
    const oneLiner = body.oneLiner.trim().slice(0, 40);
    if (oneLiner) {
      const [existing] = await db
        .select()
        .from(daySummaries)
        .where(eq(daySummaries.dayKey, dayKey))
        .limit(1);
      if (existing) {
        await db
          .update(daySummaries)
          .set({ oneLiner, updatedAt: new Date() })
          .where(eq(daySummaries.dayKey, dayKey));
      } else {
        await db.insert(daySummaries).values({ dayKey, oneLiner });
      }
      changed = true;
    }
  }

  if (body.regenerateSummary || (changed && body.oneLiner == null)) {
    await generateDaySummary(dayKey, { force: true });
  }

  // Return fresh day payload
  return GET(request, { params });
}
