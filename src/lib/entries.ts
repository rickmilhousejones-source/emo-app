import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dimensionEntries } from "@/db/schema";
import type { PeriodId } from "@/lib/period";

type EntrySource = "soft_ask" | "command" | "chat" | "edit";

export async function upsertPeriodEntry(opts: {
  dayKey: string;
  period: PeriodId;
  dimensionId: string;
  phrase: string;
  silentScore: number | null;
  source: EntrySource;
  viaAi: boolean;
}): Promise<{ id: string; created: boolean }> {
  const [existing] = await db
    .select({ id: dimensionEntries.id })
    .from(dimensionEntries)
    .where(
      and(
        eq(dimensionEntries.dayKey, opts.dayKey),
        eq(dimensionEntries.period, opts.period),
        eq(dimensionEntries.dimensionId, opts.dimensionId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(dimensionEntries)
      .set({
        phrase: opts.phrase,
        silentScore: opts.silentScore,
        source: opts.source,
        viaAi: opts.viaAi,
        createdAt: new Date(),
      })
      .where(eq(dimensionEntries.id, existing.id));
    return { id: existing.id, created: false };
  }

  const id = crypto.randomUUID();
  await db.insert(dimensionEntries).values({
    id,
    dayKey: opts.dayKey,
    period: opts.period,
    dimensionId: opts.dimensionId,
    phrase: opts.phrase,
    silentScore: opts.silentScore,
    source: opts.source,
    viaAi: opts.viaAi,
  });
  return { id, created: true };
}

export async function deletePeriodEntries(opts: {
  dayKey: string;
  dimensionId: string;
  period?: PeriodId | null;
}): Promise<number> {
  if (opts.period) {
    const rows = await db
      .select({ id: dimensionEntries.id })
      .from(dimensionEntries)
      .where(
        and(
          eq(dimensionEntries.dayKey, opts.dayKey),
          eq(dimensionEntries.period, opts.period),
          eq(dimensionEntries.dimensionId, opts.dimensionId),
        ),
      );
    for (const r of rows) {
      await db.delete(dimensionEntries).where(eq(dimensionEntries.id, r.id));
    }
    return rows.length;
  }

  const rows = await db
    .select({ id: dimensionEntries.id })
    .from(dimensionEntries)
    .where(
      and(
        eq(dimensionEntries.dayKey, opts.dayKey),
        eq(dimensionEntries.dimensionId, opts.dimensionId),
      ),
    );
  for (const r of rows) {
    await db.delete(dimensionEntries).where(eq(dimensionEntries.id, r.id));
  }
  return rows.length;
}
