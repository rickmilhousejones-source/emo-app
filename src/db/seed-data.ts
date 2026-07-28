import { eq } from "drizzle-orm";
import { db } from "./index";
import { dimensions, settings } from "./schema";

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
