import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  conversations,
  dimensionEntries,
  dimensions,
  messages,
  settings,
} from "@/db/schema";
import { ensureSeeded } from "@/db/seed-data";
import {
  buildSystemPrompt,
  parseAiJson,
  streamChatCompletion,
  type ChatMode,
} from "@/lib/ai";
import { CRISIS_APPENDIX, detectCrisis } from "@/lib/crisis";
import { resolveDayKey, todayKey } from "@/lib/day";
import { deletePeriodEntries, upsertPeriodEntry } from "@/lib/entries";
import { resolveAiConfig } from "@/lib/ai-config";
import {
  isCorrectionIntent,
  isExtractGrounded,
  isMetaOrEmptyLogIntent,
  parseDimensionChip,
  sensitiveLogChips,
} from "@/lib/extract-guard";
import {
  formatLocalNowLabel,
  parsePeriodId,
  periodFromDate,
  periodLabel,
  type PeriodId,
} from "@/lib/period";
import { generateDaySummary } from "@/lib/summary";

export const runtime = "nodejs";
export const maxDuration = 60;

const LOG_CMD = /记一下|记一笔/;

async function getOrCreateConversation(dayKey: string) {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.dayKey, dayKey))
    .limit(1);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await db.insert(conversations).values({ id, dayKey });
  return { id, dayKey, createdAt: new Date() };
}

function sseEncode(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function resolveDimId(
  raw: string,
  allowedIds: Set<string>,
  nameToId: Map<string, string>,
): string | null {
  let dimId = raw.trim();
  if (!allowedIds.has(dimId)) {
    dimId = nameToId.get(raw.trim()) || dimId;
  }
  return allowedIds.has(dimId) ? dimId : null;
}

export async function POST(request: Request) {
  await ensureSeeded();
  const body = (await request.json()) as {
    content?: string;
    tz?: string;
    forceLogging?: boolean;
  };

  const content = (body.content || "").trim();
  if (!content) {
    return new Response(JSON.stringify({ error: "空消息" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const tz = body.tz || undefined;
  const now = new Date();
  const dayKey = todayKey(tz);
  const currentPeriod = periodFromDate(now, tz);
  const crisis = detectCrisis(content);
  const wantsLog = body.forceLogging === true || LOG_CMD.test(content);

  const [setting] = await db.select().from(settings).where(eq(settings.id, 1));
  const quiet = setting?.quietTodayKey === dayKey;
  let softAskCount =
    setting?.softAskCountDayKey === dayKey ? (setting?.softAskCount ?? 0) : 0;

  const allDims = await db.select().from(dimensions);
  const enabledDims = allDims.filter((d) => d.enabled);
  const aiDims = enabledDims.filter((d) => !d.sensitive || wantsLog);

  let mode: ChatMode = "companion";
  if (wantsLog) {
    mode = "logging";
  } else if (!quiet && softAskCount < 2) {
    mode = "soft_ask";
  }

  const chipLog = parseDimensionChip(content, enabledDims);
  const touchedDays = new Set<string>();
  let wroteDirect = false;
  if (chipLog) {
    await upsertPeriodEntry({
      dayKey,
      period: currentPeriod,
      dimensionId: chipLog.dimensionId,
      phrase: chipLog.phrase,
      silentScore: null,
      source: wantsLog ? "command" : "chat",
      viaAi: false,
    });
    wroteDirect = true;
    touchedDays.add(dayKey);
  }

  const conv = await getOrCreateConversation(dayKey);
  const userMsgId = crypto.randomUUID();
  await db.insert(messages).values({
    id: userMsgId,
    conversationId: conv.id,
    dayKey,
    role: "user",
    content,
  });

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.createdAt))
    .limit(30);

  const system = buildSystemPrompt({
    displayName: setting?.displayName || "朋友",
    personaEnabled: setting?.personaEnabled ?? true,
    mode,
    softAskRemaining: Math.max(0, 2 - softAskCount),
    dimensions: aiDims.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
    })),
    todayKey: dayKey,
    currentPeriod,
    currentPeriodLabel: periodLabel(currentPeriod),
    localNowLabel: formatLocalNowLabel(now, tz),
    timeZone: tz || "local",
  });

  const llmMessages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[] = [
    { role: "system", content: system },
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEncode(event, data)));
      };

      send("meta", {
        userMessageId: userMsgId,
        mode,
        dayKey,
        period: currentPeriod,
      });

      let rawAccum = "";
      try {
        if (!(await resolveAiConfig()).apiKey) {
          rawAccum = JSON.stringify({
            reply:
              "还没配置 AI 密钥。点右上角齿轮填 API Key 和地址，可以先点「测试连接」。",
            quick_replies: [],
            extracts: [],
            corrections: [],
          });
          send("delta", { text: parseAiJson(rawAccum)?.reply || rawAccum });
        } else {
          const upstream = await streamChatCompletion(llmMessages);
          const reader = upstream.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const json = JSON.parse(payload) as {
                  choices?: { delta?: { content?: string } }[];
                };
                const piece = json.choices?.[0]?.delta?.content || "";
                if (piece) {
                  rawAccum += piece;
                  const partial = tryPartialReply(rawAccum);
                  if (partial) send("delta", { text: partial });
                }
              } catch {
                /* ignore bad chunk */
              }
            }
          }
        }

        const parsed = parseAiJson(rawAccum);
        let reply =
          parsed?.reply ||
          (rawAccum.trim()
            ? rawAccum.trim()
            : "嗯，我在听。刚才那一下没接稳，你再说一句也行。");
        let quickReplies =
          mode === "companion" ? [] : parsed?.quick_replies || [];
        if (mode === "logging") {
          const extra = sensitiveLogChips(enabledDims);
          quickReplies = [...quickReplies, ...extra]
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .slice(0, 8);
        }

        const allowAiExtract =
          !chipLog &&
          !isMetaOrEmptyLogIntent(content) &&
          !(LOG_CMD.test(content) && content.replace(LOG_CMD, "").trim() === "");
        const extracts = allowAiExtract ? parsed?.extracts || [] : [];
        // Corrections even when meta-ish phrasing appears alongside「别记」
        const corrections =
          !chipLog &&
          (allowAiExtract || isCorrectionIntent(content))
            ? parsed?.corrections || []
            : [];

        if (crisis) {
          reply = `${reply}${CRISIS_APPENDIX}`;
        }

        if (chipLog) {
          reply = `好，记下了：${enabledDims.find((d) => d.id === chipLog.dimensionId)?.name || ""} · ${chipLog.phrase}`;
        }

        if (mode === "soft_ask" && quickReplies.length > 0 && !chipLog) {
          softAskCount += 1;
          await db
            .update(settings)
            .set({
              softAskCountDayKey: dayKey,
              softAskCount,
              updatedAt: new Date(),
            })
            .where(eq(settings.id, 1));
        }

        const allowedIds = new Set(aiDims.map((d) => d.id));
        const nameToId = new Map(aiDims.map((d) => [d.name, d.id]));
        // Corrections may target any enabled dimension
        const allAllowed = new Set(enabledDims.map((d) => d.id));
        const allNameToId = new Map(enabledDims.map((d) => [d.name, d.id]));

        let wroteExtract = wroteDirect;
        let appliedCorrection = false;

        for (const corr of corrections) {
          const dimId = resolveDimId(
            corr.dimension,
            allAllowed,
            allNameToId,
          );
          const targetDay = resolveDayKey(corr.day_key, dayKey);
          if (!dimId || !targetDay) continue;
          const period = parsePeriodId(corr.period ?? undefined);

          if (corr.action === "delete") {
            const n = await deletePeriodEntries({
              dayKey: targetDay,
              dimensionId: dimId,
              period,
            });
            if (n > 0) {
              appliedCorrection = true;
              touchedDays.add(targetDay);
            }
            continue;
          }

          // update
          const phrase = (corr.phrase || "").trim().slice(0, 120);
          if (!phrase) continue;
          if (!period && targetDay !== dayKey) {
            // Past day without period: skip update (same rule as extracts)
            continue;
          }
          const usePeriod: PeriodId = period || currentPeriod;
          await upsertPeriodEntry({
            dayKey: targetDay,
            period: usePeriod,
            dimensionId: dimId,
            phrase,
            silentScore:
              typeof corr.silent_score === "number" ? corr.silent_score : null,
            source: "chat",
            viaAi: true,
          });
          appliedCorrection = true;
          touchedDays.add(targetDay);
        }

        const recent = await db
          .select({
            dimensionId: dimensionEntries.dimensionId,
            phrase: dimensionEntries.phrase,
            period: dimensionEntries.period,
            dayKey: dimensionEntries.dayKey,
          })
          .from(dimensionEntries)
          .where(eq(dimensionEntries.dayKey, dayKey))
          .orderBy(desc(dimensionEntries.createdAt))
          .limit(20);

        for (const ex of extracts) {
          const dimId = resolveDimId(ex.dimension, allowedIds, nameToId);
          if (!dimId) continue;
          const phrase = ex.phrase.trim().slice(0, 120);
          if (!phrase) continue;
          if (!isExtractGrounded(phrase, content)) continue;

          const targetDay = resolveDayKey(ex.day_key, dayKey) || dayKey;
          const explicitPeriod = parsePeriodId(ex.period ?? undefined);
          let period: PeriodId | null = explicitPeriod;
          if (!period) {
            if (targetDay === dayKey) {
              period = currentPeriod;
            } else {
              // Past without clear period — do not write
              continue;
            }
          }

          const dup = recent.some(
            (r) =>
              r.dayKey === targetDay &&
              r.dimensionId === dimId &&
              r.period === period &&
              r.phrase.replace(/\s/g, "") === phrase.replace(/\s/g, ""),
          );
          if (dup) continue;

          await upsertPeriodEntry({
            dayKey: targetDay,
            period,
            dimensionId: dimId,
            phrase,
            silentScore:
              typeof ex.silent_score === "number" ? ex.silent_score : null,
            source: wantsLog
              ? "command"
              : mode === "soft_ask"
                ? "soft_ask"
                : "chat",
            viaAi: true,
          });
          wroteExtract = true;
          touchedDays.add(targetDay);
          recent.unshift({
            dimensionId: dimId,
            phrase,
            period,
            dayKey: targetDay,
          });
        }

        // If model claimed a fix but nothing applied, soften lying claims
        if (
          !appliedCorrection &&
          /已(改|删|更正|去掉|移除)|帮你改|已经改/.test(reply) &&
          /(别记|不要记|删掉|改成|记错)/.test(content)
        ) {
          reply = `${reply.replace(/已(改|删|更正|去掉|移除)[了啦吧]?/g, "我先记下你的意思")}（刚才没能改到账本，你再说一下要改哪一天哪一段，或去回顾页手动编辑。）`;
        }

        const assistantId = crypto.randomUUID();
        await db.insert(messages).values({
          id: assistantId,
          conversationId: conv.id,
          dayKey,
          role: "assistant",
          content: reply,
        });

        if (touchedDays.size > 0) {
          await Promise.all(
            [...touchedDays].map((dk) =>
              generateDaySummary(dk, { force: true }).catch(() => undefined),
            ),
          );
        }

        send("final", {
          assistantMessageId: assistantId,
          reply,
          quick_replies: quickReplies,
          extracts: wroteExtract ? extracts : [],
          corrections: appliedCorrection ? corrections : [],
          mode,
          softAskCount,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "聊天失败";
        send("error", { error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function tryPartialReply(raw: string): string | null {
  const m = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) {
    try {
      return JSON.parse(`"${m[1]}"`) as string;
    } catch {
      return m[1];
    }
  }
  if (!raw.includes("{") && raw.length > 2) return raw;
  return null;
}
