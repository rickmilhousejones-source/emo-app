import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { daySummaries, dimensionEntries, dimensions } from "@/db/schema";
import { callChatCompletion } from "@/lib/ai";

export async function maybeGenerateDaySummary(dayKey: string) {
  const entries = await db
    .select({
      phrase: dimensionEntries.phrase,
      dimName: dimensions.name,
    })
    .from(dimensionEntries)
    .leftJoin(dimensions, eq(dimensionEntries.dimensionId, dimensions.id))
    .where(eq(dimensionEntries.dayKey, dayKey))
    .orderBy(desc(dimensionEntries.createdAt))
    .limit(12);

  if (entries.length === 0) return;

  const existing = await db
    .select()
    .from(daySummaries)
    .where(eq(daySummaries.dayKey, dayKey))
    .limit(1);

  // Refresh when new extracts arrive, but keep it cheap: skip if already has summary and only 1 entry
  if (existing.length > 0 && entries.length === 1) return;

  const bullets = entries
    .map((e) => `- ${e.dimName || "维度"}：${e.phrase}`)
    .join("\n");

  let oneLiner = entries[0]?.phrase || "今天记了一笔";
  try {
    const raw = await callChatCompletion([
      {
        role: "system",
        content:
          "根据当天记入的口语短语，写一句不超过 28 个汉字的中文摘要。只输出这一句话，不要引号，不要解释。",
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

  if (existing.length > 0) {
    await db
      .update(daySummaries)
      .set({ oneLiner, updatedAt: new Date() })
      .where(eq(daySummaries.dayKey, dayKey));
  } else {
    await db.insert(daySummaries).values({ dayKey, oneLiner });
  }
}
