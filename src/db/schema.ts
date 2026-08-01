import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey().default(1),
  displayName: text("display_name").notNull().default("朋友"),
  personaEnabled: integer("persona_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  quietTodayKey: text("quiet_today_key"),
  softAskCountDayKey: text("soft_ask_count_day_key"),
  softAskCount: integer("soft_ask_count").notNull().default(0),
  aiApiKey: text("ai_api_key"),
  aiBaseUrl: text("ai_base_url"),
  aiModel: text("ai_model"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const dimensions = sqliteTable("dimensions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["scale_phrase", "amount_phrase", "tag_phrase"],
  }).notNull(),
  sensitive: integer("sensitive", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  dayKey: text("day_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  dayKey: text("day_key").notNull(),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const dimensionEntries = sqliteTable("dimension_entries", {
  id: text("id").primaryKey(),
  dayKey: text("day_key").notNull(),
  /** null = legacy whole-day entry; new writes use morning|forenoon|noon|afternoon|evening|night */
  period: text("period"),
  dimensionId: text("dimension_id")
    .notNull()
    .references(() => dimensions.id),
  phrase: text("phrase").notNull(),
  silentScore: real("silent_score"),
  source: text("source", {
    enum: ["soft_ask", "command", "chat", "edit"],
  }).notNull(),
  viaAi: integer("via_ai", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const daySummaries = sqliteTable("day_summaries", {
  dayKey: text("day_key").primaryKey(),
  oneLiner: text("one_liner").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Setting = typeof settings.$inferSelect;
export type Dimension = typeof dimensions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type DimensionEntry = typeof dimensionEntries.$inferSelect;
export type DaySummary = typeof daySummaries.$inferSelect;
