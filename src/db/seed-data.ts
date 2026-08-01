import { eq } from "drizzle-orm";
import { client, db } from "./index";
import { dimensions, settings } from "./schema";

async function ensurePeriodColumn() {
  try {
    await client.execute(
      "ALTER TABLE dimension_entries ADD COLUMN period text",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/duplicate column|already exists/i.test(msg)) {
      // Table might not exist yet on fresh push — ignore soft failures
      if (!/no such table/i.test(msg)) {
        console.warn("[emolog] period column migrate:", msg);
      }
    }
  }
}

export const SEED_DIMENSIONS = [
  {
    id: "mood",
    name: "心情",
    type: "scale_phrase" as const,
    sensitive: false,
    enabled: true,
    sortOrder: 1,
  },
  {
    id: "anxiety",
    name: "焦虑",
    type: "scale_phrase" as const,
    sensitive: false,
    enabled: true,
    sortOrder: 2,
  },
  {
    id: "sleep",
    name: "睡眠",
    type: "scale_phrase" as const,
    sensitive: false,
    enabled: true,
    sortOrder: 3,
  },
  {
    id: "caffeine",
    name: "咖啡因",
    type: "amount_phrase" as const,
    sensitive: false,
    enabled: true,
    sortOrder: 4,
  },
  {
    id: "kinship",
    name: "对亲友看法",
    type: "tag_phrase" as const,
    sensitive: true,
    enabled: true,
    sortOrder: 5,
  },
];

let seeded = false;

export async function ensureSeeded() {
  if (seeded) return;
  await ensurePeriodColumn();
  const existing = await db.select().from(settings).where(eq(settings.id, 1));
  if (existing.length === 0) {
    await db.insert(settings).values({ id: 1 });
  }

  const dims = await db.select().from(dimensions);
  if (dims.length === 0) {
    await db.insert(dimensions).values(SEED_DIMENSIONS);
  }
  seeded = true;
}
