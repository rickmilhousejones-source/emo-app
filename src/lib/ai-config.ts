import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { ensureSeeded } from "@/db/seed-data";

export type AiRuntimeConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

/** 优先用设置页保存的值，否则回退到环境变量 */
export async function resolveAiConfig(overrides?: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): Promise<AiRuntimeConfig> {
  await ensureSeeded();
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));

  const apiKey =
    (overrides?.apiKey?.trim() ||
      row?.aiApiKey?.trim() ||
      process.env.AI_API_KEY ||
      "").trim();

  const baseUrl = (
    overrides?.baseUrl?.trim() ||
    row?.aiBaseUrl?.trim() ||
    process.env.AI_BASE_URL ||
    "https://api.deepseek.com"
  )
    .trim()
    .replace(/\/$/, "");

  const model =
    (overrides?.model?.trim() ||
      row?.aiModel?.trim() ||
      process.env.AI_MODEL ||
      "deepseek-chat").trim() || "deepseek-chat";

  return { apiKey, baseUrl, model };
}

export function maskApiKey(key: string | null | undefined): string {
  const k = (key || "").trim();
  if (!k) return "";
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 3)}••••${k.slice(-4)}`;
}
