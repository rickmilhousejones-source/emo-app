import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import {
  daySummaries,
  dimensionEntries,
  dimensions,
  messages,
  settings,
} from "@/db/schema";
import { ensureSeeded } from "@/db/seed-data";

export async function GET() {
  await ensureSeeded();

  const [setting] = await db.select().from(settings);
  const dims = await db.select().from(dimensions).orderBy(dimensions.sortOrder);
  const msgs = await db.select().from(messages).orderBy(asc(messages.createdAt));
  const entries = await db
    .select()
    .from(dimensionEntries)
    .orderBy(asc(dimensionEntries.createdAt));
  const summaries = await db
    .select()
    .from(daySummaries)
    .orderBy(asc(daySummaries.dayKey));

  const payload = {
    exportedAt: new Date().toISOString(),
    app: "Emolog",
    version: 1,
    settings: setting
      ? {
          displayName: setting.displayName,
          personaEnabled: setting.personaEnabled,
          quietTodayKey: setting.quietTodayKey,
        }
      : null,
    dimensions: dims,
    messages: msgs.map((m) => ({
      id: m.id,
      dayKey: m.dayKey,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
    dimensionEntries: entries,
    daySummaries: summaries,
    note: "本导出不含 API Key。Emolog 不是医疗产品。",
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="emolog-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
