import { NextResponse } from "next/server";
import { resolveAiConfig } from "@/lib/ai-config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };

    const cfg = await resolveAiConfig({
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      model: body.model,
    });

    if (!cfg.apiKey) {
      return NextResponse.json(
        { ok: false, error: "还没有填 API Key" },
        { status: 400 },
      );
    }

    const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 16,
        messages: [
          {
            role: "user",
            content: "只回复两个字：连通",
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        {
          ok: false,
          error: `接口返回 ${res.status}：${text.slice(0, 180)}`,
          baseUrl: cfg.baseUrl,
          model: cfg.model,
        },
        { status: 400 },
      );
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
    };
    const reply = data.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({
      ok: true,
      message: "连接成功",
      reply,
      baseUrl: cfg.baseUrl,
      model: data.model || cfg.model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "测试失败";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
