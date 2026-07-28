import { z } from "zod";
import { resolveAiConfig } from "@/lib/ai-config";

export const aiExtractSchema = z.object({
  dimension: z.string(),
  phrase: z.string(),
  silent_score: z.number().min(0).max(10).nullable().optional(),
});

export const aiResponseSchema = z.object({
  reply: z.string(),
  quick_replies: z.array(z.string()).optional().default([]),
  extracts: z.array(aiExtractSchema).optional().default([]),
});

export type AiResponse = z.infer<typeof aiResponseSchema>;

export type ChatMode = "soft_ask" | "logging" | "companion";

export type DimensionPromptInfo = {
  id: string;
  name: string;
  type: string;
};

export function buildSystemPrompt(opts: {
  displayName: string;
  personaEnabled: boolean;
  mode: ChatMode;
  softAskRemaining: number;
  dimensions: DimensionPromptInfo[];
}): string {
  const dimList =
    opts.dimensions.length > 0
      ? opts.dimensions
          .map((d) => `- ${d.id}（${d.name}，类型 ${d.type}）`)
          .join("\n")
      : "（本轮无可用维度）";

  const persona = opts.personaEnabled
    ? `你是 Emolog 里一个温和、接地气的朋友。偶尔用「${opts.displayName}」点名，不要每句都喊。语气像真人聊天，短句优先，不要说教，不要扮演医生或治疗师。`
    : `你是 Emolog 的陪伴回复助手。语气平和，短句优先。不要说教，不要扮演医生。`;

  const modeHint =
    opts.mode === "logging"
      ? `当前用户主动「记一下」。请用一两句确认，并给出 2～4 个口语化推荐回答芯片（quick_replies），方便用户点选记入。可从已启用维度里轻轻引导一次。`
      : opts.mode === "soft_ask"
        ? `今天还可以软问 ${opts.softAskRemaining} 次。如果合适，用一句很轻的问题关心某个维度；同时给出 2～4 个 quick_replies 芯片。不想硬挖就不要问。`
        : `本轮是纯倾诉陪伴：不要主动抽维、不要给 quick_replies、不要强行记账。专心陪聊。`;

  return `${persona}

重要：你必须只输出一个 JSON 对象（不要 markdown 代码块），结构如下：
{
  "reply": "给用户看的自然语言回复",
  "quick_replies": ["芯片1", "芯片2"],
  "extracts": [{"dimension": "mood", "phrase": "口语短语", "silent_score": 6}]
}

规则：
1. reply 必填，用中文。
2. quick_replies 仅在软问或记账模式需要时给出，否则返回 []。
3. extracts 仅当用户明确表达了可记录信息时写入；phrase 用用户口语；silent_score 为 0–10 可选静默分（心情/焦虑越高越好或越严重请按常理：焦虑越高分越高表示更焦虑；心情越高分越高表示越好）。
4. dimension 字段必须用维度 id（英文 id），不要用中文名。
5. 敏感维度如果不在下方列表里，不要提取。
6. 这不是医疗工具。不要诊断、不开药。

已启用、且可交给你参考的维度：
${dimList}

${modeHint}`;
}

export function parseAiJson(raw: string): AiResponse | null {
  const trimmed = raw.trim();
  let candidate = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidate = fence[1].trim();
  const brace = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (brace >= 0 && last > brace) {
    candidate = candidate.slice(brace, last + 1);
  }
  try {
    const parsed = JSON.parse(candidate);
    const result = aiResponseSchema.safeParse(parsed);
    if (result.success) return result.data;
  } catch {
    /* fall through */
  }
  return null;
}

export async function callChatCompletion(messages: {
  role: "system" | "user" | "assistant";
  content: string;
}[]): Promise<string> {
  const { apiKey, baseUrl, model } = await resolveAiConfig();
  if (!apiKey) {
    throw new Error("未配置 AI 密钥");
  }

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI 请求失败 ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export async function streamChatCompletion(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): Promise<ReadableStream<Uint8Array>> {
  const { apiKey, baseUrl, model } = await resolveAiConfig();
  if (!apiKey) {
    throw new Error("未配置 AI 密钥");
  }

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`AI 流式请求失败 ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.body;
}
