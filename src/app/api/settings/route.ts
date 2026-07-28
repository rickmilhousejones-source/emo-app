import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dimensions, settings } from "@/db/schema";
import { ensureSeeded } from "@/db/seed-data";
import { maskApiKey } from "@/lib/ai-config";
import { todayKey } from "@/lib/day";

export async function GET(request: Request) {
  await ensureSeeded();
  const url = new URL(request.url);
  const tz = url.searchParams.get("tz") || undefined;
  const day = todayKey(tz || undefined);

  const [setting] = await db.select().from(settings).where(eq(settings.id, 1));
  const dims = await db.select().from(dimensions).orderBy(dimensions.sortOrder);

  const dbKey = setting?.aiApiKey?.trim() || "";
  const envKey = process.env.AI_API_KEY?.trim() || "";
  const effectiveKey = dbKey || envKey;

  return NextResponse.json({
    displayName: setting?.displayName ?? "朋友",
    personaEnabled: setting?.personaEnabled ?? true,
    quietToday: setting?.quietTodayKey === day,
    quietTodayKey: setting?.quietTodayKey ?? null,
    softAskCount:
      setting?.softAskCountDayKey === day ? (setting?.softAskCount ?? 0) : 0,
    softAskLimit: 2,
    aiConfigured: Boolean(effectiveKey),
    aiKeyMasked: maskApiKey(effectiveKey),
    aiKeyFromEnv: Boolean(envKey) && !dbKey,
    aiBaseUrl:
      setting?.aiBaseUrl?.trim() ||
      process.env.AI_BASE_URL ||
      "https://api.deepseek.com",
    aiModel:
      setting?.aiModel?.trim() || process.env.AI_MODEL || "deepseek-chat",
    dayKey: day,
    dimensions: dims,
  });
}

export async function PATCH(request: Request) {
  await ensureSeeded();
  const body = (await request.json()) as {
    displayName?: string;
    personaEnabled?: boolean;
    quietToday?: boolean;
    tz?: string;
    aiApiKey?: string | null;
    aiBaseUrl?: string;
    aiModel?: string;
    clearAiApiKey?: boolean;
    dimensions?: { id: string; enabled?: boolean; sensitive?: boolean }[];
  };

  const day = todayKey(body.tz);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  let touchSettings = false;

  if (body.displayName !== undefined) {
    patch.displayName = body.displayName.trim() || "朋友";
    touchSettings = true;
  }
  if (body.personaEnabled !== undefined) {
    patch.personaEnabled = body.personaEnabled;
    touchSettings = true;
  }
  if (body.quietToday === true) {
    patch.quietTodayKey = day;
    touchSettings = true;
  } else if (body.quietToday === false) {
    patch.quietTodayKey = null;
    touchSettings = true;
  }
  if (body.aiBaseUrl !== undefined) {
    patch.aiBaseUrl = body.aiBaseUrl.trim().replace(/\/$/, "") || null;
    touchSettings = true;
  }
  if (body.aiModel !== undefined) {
    patch.aiModel = body.aiModel.trim() || null;
    touchSettings = true;
  }
  if (body.clearAiApiKey) {
    patch.aiApiKey = null;
    touchSettings = true;
  } else if (body.aiApiKey !== undefined && body.aiApiKey !== null) {
    const key = body.aiApiKey.trim();
    if (key) {
      patch.aiApiKey = key;
      touchSettings = true;
    }
  }

  if (touchSettings) {
    await db.update(settings).set(patch).where(eq(settings.id, 1));
  }

  if (body.dimensions?.length) {
    for (const d of body.dimensions) {
      await db
        .update(dimensions)
        .set({
          ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
          ...(d.sensitive !== undefined ? { sensitive: d.sensitive } : {}),
        })
        .where(eq(dimensions.id, d.id));
    }
  }

  return NextResponse.json({ ok: true });
}
