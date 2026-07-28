import { asc, eq } from "drizzle-orm";
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
import { todayKey } from "@/lib/day";
import { resolveAiConfig } from "@/lib/ai-config";
import { maybeGenerateDaySummary } from "@/lib/summary";

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

  const dayKey = todayKey(body.tz);
  const crisis = detectCrisis(content);
  const wantsLog = body.forceLogging === true || LOG_CMD.test(content);

  const [setting] = await db.select().from(settings).where(eq(settings.id, 1));
  const quiet = setting?.quietTodayKey === dayKey;
  let softAskCount =
    setting?.softAskCountDayKey === dayKey ? (setting?.softAskCount ?? 0) : 0;

  const allDims = await db.select().from(dimensions);
  const enabledDims = allDims.filter((d) => d.enabled);
  // Sensitive dims: skip sending to AI entirely in V1
  const aiDims = enabledDims.filter((d) => !d.sensitive);

  let mode: ChatMode = "companion";
  if (wantsLog) {
    mode = "logging";
  } else if (!quiet && softAskCount < 2) {
    mode = "soft_ask";
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
      });

      let rawAccum = "";
      try {
        if (!(await resolveAiConfig()).apiKey) {
          rawAccum = JSON.stringify({
            reply: "还没配置 AI 密钥。点右上角齿轮填 API Key 和地址，可以先点「测试连接」。",
            quick_replies: [],
            extracts: [],
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
                  // Stream visible reply heuristically while JSON accumulates
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
        const quickReplies =
          mode === "companion" ? [] : parsed?.quick_replies || [];
        const extracts = mode === "companion" ? [] : parsed?.extracts || [];

        if (crisis) {
          reply = `${reply}${CRISIS_APPENDIX}`;
        }

        // If soft-ask produced a question-like reply with chips, bump quota
        if (mode === "soft_ask" && quickReplies.length > 0) {
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
        const nameToId = new Map(enabledDims.map((d) => [d.name, d.id]));
        let wroteExtract = false;

        for (const ex of extracts) {
          let dimId = ex.dimension;
          if (!allowedIds.has(dimId)) {
            dimId = nameToId.get(ex.dimension) || dimId;
          }
          if (!allowedIds.has(dimId)) continue;
          await db.insert(dimensionEntries).values({
            id: crypto.randomUUID(),
            dayKey,
            dimensionId: dimId,
            phrase: ex.phrase.slice(0, 120),
            silentScore:
              typeof ex.silent_score === "number" ? ex.silent_score : null,
            source: wantsLog ? "command" : mode === "soft_ask" ? "soft_ask" : "chat",
            viaAi: true,
          });
          wroteExtract = true;
        }

        const assistantId = crypto.randomUUID();
        await db.insert(messages).values({
          id: assistantId,
          conversationId: conv.id,
          dayKey,
          role: "assistant",
          content: reply,
        });

        if (wroteExtract) {
          void maybeGenerateDaySummary(dayKey).catch(() => undefined);
        }

        send("final", {
          assistantMessageId: assistantId,
          reply,
          quick_replies: quickReplies,
          extracts: wroteExtract ? extracts : [],
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
  // If it looks like plain text (no JSON yet), stream as-is carefully
  if (!raw.includes("{") && raw.length > 2) return raw;
  return null;
}
