import { z } from "zod";
import { resolveAiConfig } from "@/lib/ai-config";
import { PERIOD_IDS } from "@/lib/period";

export const aiExtractSchema = z.object({
  dimension: z.string(),
  phrase: z.string(),
  silent_score: z.number().min(0).max(10).nullable().optional(),
  /** YYYY-MM-DD or 今天/昨天/前天 / today/yesterday */
  day_key: z.string().optional().nullable(),
  /** morning|forenoon|noon|afternoon|evening|night or 中文 */
  period: z.string().optional().nullable(),
});

export const aiCorrectionSchema = z.object({
  action: z.enum(["update", "delete"]),
  day_key: z.string(),
  period: z.string().optional().nullable(),
  dimension: z.string(),
  phrase: z.string().optional().nullable(),
  silent_score: z.number().min(0).max(10).nullable().optional(),
});

export const aiResponseSchema = z.object({
  reply: z.string(),
  quick_replies: z.array(z.string()).optional().default([]),
  extracts: z.array(aiExtractSchema).optional().default([]),
  corrections: z.array(aiCorrectionSchema).optional().default([]),
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
  todayKey: string;
  currentPeriod: string;
  currentPeriodLabel: string;
  localNowLabel: string;
  timeZone: string;
}): string {
  const dimList =
    opts.dimensions.length > 0
      ? opts.dimensions
          .map((d) => `- ${d.id}（${d.name}，类型 ${d.type}）`)
          .join("\n")
      : "（本轮无可用维度）";

  const persona = opts.personaEnabled
    ? `你是 Emolog 里一个温和、接地气的朋友。偶尔用「${opts.displayName}」点名，不要每句都喊。语气像真人聊天，可以多接两句共情，不要说教，不要扮演医生或治疗师，不要会计账腔。`
    : `你是 Emolog 的陪伴回复助手。语气平和，可多聊两句。不要说教，不要扮演医生。`;

  const modeHint =
    opts.mode === "logging"
      ? `当前用户主动「记一下」。用一两句自然确认，并给出 2～4 个口语化 quick_replies（可覆盖不同维度）。只有用户这句里真有可记内容时才写 extracts；若只是点了「记一下」，extracts 必须为 []。`
      : opts.mode === "soft_ask"
        ? `今天还可以软问 ${opts.softAskRemaining} 次。若合适，用一句很轻的问题关心某个维度，并给 2～4 个 quick_replies。不要连续追问同一个维度。闲聊优先。若用户这句里已经说了可记信息，写入 extracts；若只是在聊天/反问/测试，extracts 必须为 []。`
        : `本轮以陪伴闲聊为主：可以多聊一点，不要主动追问维度、不要给 quick_replies。若用户明确说了可记的当下或过去状态，仍写入 extracts；否则 extracts 必须为 []。`;

  const periods = PERIOD_IDS.join("|");

  return `${persona}

时间锚定（必须以服务端为准，禁止弄混）：
- 时区：${opts.timeZone || "未知"}
- 本地现在：${opts.localNowLabel}
- 今天 day_key：${opts.todayKey}
- 当前时段：${opts.currentPeriod}（${opts.currentPeriodLabel}）

重要：你必须只输出一个 JSON 对象（不要 markdown 代码块），结构如下：
{
  "reply": "给用户看的自然语言回复",
  "quick_replies": ["芯片1", "芯片2"],
  "extracts": [{"dimension": "mood", "phrase": "口语短语", "silent_score": 6, "day_key": "${opts.todayKey}", "period": "${opts.currentPeriod}"}],
  "corrections": [{"action": "delete", "day_key": "${opts.todayKey}", "period": "${opts.currentPeriod}", "dimension": "mood"}]
}

规则：
1. reply 必填，用中文。先回应这句话本身；可以共情、多聊两句，不要为记账而记账。
2. quick_replies 仅在软问或记账模式需要时给出，否则返回 []。
3. extracts 只能依据「用户本轮这句话」里明确的状态。phrase 尽量用用户原话片段。
4. 记「现在/今天」的状态：day_key 用 ${opts.todayKey}，period 用 ${opts.currentPeriod}（除非用户明确说了别的时段）。
5. 记过去：day_key 可用 YYYY-MM-DD，或「昨天」「前天」；period 必须能从用户话判断（早上/上午/中午/下午/晚上/深夜 或 ${periods}）。日期或时段任一不清楚 → 不要写这条 extract，必要时在 reply 里问一句。
6. 同一天同一时段同一维度只会保留最后一条；服务端会覆盖，你无需重复堆叠。
7. 用户说「别记 / 记错了 / 改成…」时：必须写 corrections（update 或 delete），不要只在 reply 里口头答应。未写入 corrections 就禁止说「已改」「已删」。
8. corrections.day_key / period / dimension 规则同 extracts。delete 可省略 phrase；update 必须带新 phrase。
9. 若用户在问元问题（听得到吗、在吗、能不能记昨天），extracts 与 corrections 均为 []。
10. silent_score 为 0–10 可选：心情越高越好；焦虑越高分越焦虑；睡眠≈小时数（封顶 10）；咖啡因≈杯数/份数（封顶 10）。
11. dimension 必须用英文 id（如 mood / anxiety / sleep / caffeine），不要用中文名。
12. 不在下方列表里的维度一律不要提取。
13. 这不是医疗工具。不要诊断、不开药。摘要与回复不要特意复述用户已要求删除的敏感旧事。

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
