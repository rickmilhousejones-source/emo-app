import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { daySummaries, dimensionEntries, dimensions } from "@/db/schema";
import { callChatCompletion } from "@/lib/ai";
import { periodLabel, type PeriodId } from "@/lib/period";

export async function generateDaySummary(
  dayKey: string,
  opts?: { force?: boolean },
) {
  const force = opts?.force === true;

  const entries = await db
    .select({
      phrase: dimensionEntries.phrase,
      dimName: dimensions.name,
      period: dimensionEntries.period,
    })
    .from(dimensionEntries)
    .leftJoin(dimensions, eq(dimensionEntries.dimensionId, dimensions.id))
    .where(eq(dimensionEntries.dayKey, dayKey))
    .orderBy(desc(dimensionEntries.createdAt))
    .limit(24);

  const [existing] = await db
    .select()
    .from(daySummaries)
    .where(eq(daySummaries.dayKey, dayKey))
    .limit(1);

  if (entries.length === 0) {
    if (existing) {
      await db.delete(daySummaries).where(eq(daySummaries.dayKey, dayKey));
    }
    return;
  }

  // Cheap path: brand-new single entry and no summary yet — use phrase
  if (!force && !existing && entries.length === 1) {
    await db.insert(daySummaries).values({
      dayKey,
      oneLiner: entries[0].phrase.slice(0, 40),
    });
    return;
  }

  const bullets = entries
    .map((e) => {
      const when = periodLabel((e.period as PeriodId | null) || null);
      return `- [${when}] ${e.dimName || "维度"}：${e.phrase}`;
    })
    .join("\n");

  let oneLiner = entries[0]?.phrase || "今天记了一笔";
  try {
    const raw = await callChatCompletion([
      {
        role: "system",
        content:
          "根据当天仍有效的口语短语，写一句不超过 28 个汉字的中文摘要。只依据列表内容，不要编造已删除的事。只输出这一句话，不要引号，不要解释。",
      },
      {
        role: "user",
        content: `日期 ${dayKey}\n${bullets}`,
      },
    ]);
    if (raw) oneLiner = raw.replace(/^["「]|["」]$/g, "").slice(0, 40);
  } catch {
    /* keep fallback */
  }

  if (existing) {
    await db
      .update(daySummaries)
      .set({ oneLiner, updatedAt: new Date() })
      .where(eq(daySummaries.dayKey, dayKey));
  } else {
    await db.insert(daySummaries).values({ dayKey, oneLiner });
  }
}

/** @deprecated use generateDaySummary — kept as alias */
export async function maybeGenerateDaySummary(dayKey: string) {
  return generateDaySummary(dayKey, { force: true });
}
