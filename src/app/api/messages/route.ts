import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { ensureSeeded } from "@/db/seed-data";
import { todayKey } from "@/lib/day";

export async function GET(request: Request) {
  await ensureSeeded();
  const url = new URL(request.url);
  const tz = url.searchParams.get("tz") || undefined;
  const dayKey = url.searchParams.get("day") || todayKey(tz);

  let [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.dayKey, dayKey))
    .limit(1);

  if (!conv) {
    const id = crypto.randomUUID();
    await db.insert(conversations).values({ id, dayKey });
    [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv!.id))
    .orderBy(asc(messages.createdAt));

  return NextResponse.json({
    dayKey,
    conversationId: conv!.id,
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}
