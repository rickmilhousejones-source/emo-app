"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Dim = {
  id: string;
  name: string;
  type: string;
  sensitive: boolean;
  enabled: boolean;
};

type SettingsData = {
  displayName: string;
  personaEnabled: boolean;
  quietToday: boolean;
  aiConfigured: boolean;
  aiKeyMasked: string;
  aiKeyFromEnv: boolean;
  aiBaseUrl: string;
  aiModel: string;
  dimensions: Dim[];
};

type SettingsSheetProps = {
  open: boolean;
  onClose: () => void;
};

function deviceTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const router = useRouter();
  const [data, setData] = useState<SettingsData | null>(null);
  const [name, setName] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("https://api.deepseek.com");
  const [aiModel, setAiModel] = useState("deepseek-chat");
  const [aiApiKey, setAiApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgBad, setMsgBad] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      const res = await fetch(
        `/api/settings?tz=${encodeURIComponent(deviceTz() || "")}`,
      );
      if (!res.ok) return;
      const json = (await res.json()) as SettingsData;
      if (!cancelled) {
        setData(json);
        setName(json.displayName);
        setAiBaseUrl(json.aiBaseUrl || "https://api.deepseek.com");
        setAiModel(json.aiModel || "deepseek-chat");
        setAiApiKey("");
        setMsg("");
        setMsgBad(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    setMsg("");
    setMsgBad(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, tz: deviceTz() }),
      });
      if (!res.ok) throw new Error("保存失败");
      setMsg("已保存");
      const refreshed = await fetch(
        `/api/settings?tz=${encodeURIComponent(deviceTz() || "")}`,
      );
      if (refreshed.ok) {
        const json = (await refreshed.json()) as SettingsData;
        setData(json);
        setName(json.displayName);
        setAiBaseUrl(json.aiBaseUrl || "https://api.deepseek.com");
        setAiModel(json.aiModel || "deepseek-chat");
        if ("aiApiKey" in patch || "clearAiApiKey" in patch) {
          setAiApiKey("");
        }
      }
    } catch {
      setMsg("保存失败");
      setMsgBad(true);
    } finally {
      setSaving(false);
    }
  }

  async function saveAi() {
    const patch: Record<string, unknown> = {
      aiBaseUrl,
      aiModel,
    };
    if (aiApiKey.trim()) {
      patch.aiApiKey = aiApiKey.trim();
    }
    await save(patch);
  }

  async function testAi() {
    setTesting(true);
    setMsg("");
    setMsgBad(false);
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: aiApiKey.trim() || undefined,
          baseUrl: aiBaseUrl.trim() || undefined,
          model: aiModel.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        model?: string;
      };
      if (!res.ok || !json.ok) {
        setMsg(json.error || "连接失败");
        setMsgBad(true);
        return;
      }
      // 测试只带临时 Key，聊天读的是库里的配置——成功后自动保存
      const patch: Record<string, unknown> = {
        aiBaseUrl,
        aiModel,
      };
      if (aiApiKey.trim()) {
        patch.aiApiKey = aiApiKey.trim();
      }
      await save(patch);
      setMsg(
        `${json.message || "连接成功"}（模型 ${json.model || aiModel}），已保存`,
      );
      setMsgBad(false);
    } catch {
      setMsg("网络错误，测不通");
      setMsgBad(true);
    } finally {
      setTesting(false);
    }
  }

  async function exportBackup() {
    const res = await fetch("/api/export");
    if (!res.ok) {
      setMsg("导出失败");
      setMsgBad(true);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `emolog-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("已开始下载备份");
    setMsgBad(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/55"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[78dvh] overflow-y-auto rounded-t-[20px] border-t border-line bg-[#1c1915] px-4 pb-7 pt-[18px] animate-[rise_0.25s_ease]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="设置"
      >
        <h4 className="text-base font-semibold">设置</h4>
        <p className="mb-3.5 mt-1 text-[0.78rem] leading-snug text-ink-muted">
          称呼、AI 密钥、维度、备份。手机同一 WiFi 下也能打开用。
        </p>

        <label className="block border-b border-line py-3 text-[0.88rem]">
          <div>AI 怎么喊你</div>
          <div className="mt-2 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-[10px] border border-line bg-bg-elevated px-3 py-2 text-[0.88rem] outline-none focus:border-accent/45"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void save({ displayName: name })}
              className="rounded-[10px] border border-line px-3 text-[0.8rem] text-accent"
            >
              保存
            </button>
          </div>
        </label>

        <label className="flex items-center justify-between border-b border-line py-3 text-[0.88rem]">
          <span>
            人设语气
            <span className="mt-0.5 block text-[0.72rem] text-ink-muted">
              温和朋友口吻
            </span>
          </span>
          <input
            type="checkbox"
            checked={data?.personaEnabled ?? true}
            onChange={(e) => void save({ personaEnabled: e.target.checked })}
          />
        </label>

        <div className="border-b border-line py-3 text-[0.88rem]">
          <div className="mb-1">AI 配置</div>
          <p className="mb-2 text-[0.72rem] text-ink-muted">
            {data?.aiConfigured
              ? `已配置 · ${data.aiKeyMasked || "••••"}${data.aiKeyFromEnv ? "（来自环境变量）" : ""}`
              : "还没配密钥 · 填好后点「测试连接」会自动保存"}
          </p>

          <label className="mb-2 block text-[0.75rem] text-ink-muted">
            API 地址
            <input
              value={aiBaseUrl}
              onChange={(e) => setAiBaseUrl(e.target.value)}
              placeholder="https://api.deepseek.com"
              className="mt-1 w-full rounded-[10px] border border-line bg-bg-elevated px-3 py-2 text-[0.85rem] text-ink outline-none focus:border-accent/45"
            />
          </label>

          <label className="mb-2 block text-[0.75rem] text-ink-muted">
            模型名
            <input
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder="deepseek-chat"
              className="mt-1 w-full rounded-[10px] border border-line bg-bg-elevated px-3 py-2 text-[0.85rem] text-ink outline-none focus:border-accent/45"
            />
            <span className="mt-1 block text-[0.7rem] leading-snug text-ink-muted/80">
              中文闲聊可优先试 DeepSeek（deepseek-chat）或通义 Qwen；GPT
              有时偏书面生硬。
            </span>
          </label>

          <label className="mb-2 block text-[0.75rem] text-ink-muted">
            API Key
            <input
              type="password"
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder={
                data?.aiConfigured
                  ? "已保存则留空不改"
                  : "粘贴你的 Key"
              }
              autoComplete="off"
              className="mt-1 w-full rounded-[10px] border border-line bg-bg-elevated px-3 py-2 text-[0.85rem] text-ink outline-none focus:border-accent/45"
            />
          </label>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveAi()}
              className="rounded-[10px] border border-line px-3 py-2 text-[0.8rem] text-accent"
            >
              保存 AI 配置
            </button>
            <button
              type="button"
              disabled={testing}
              onClick={() => void testAi()}
              className="rounded-[10px] border border-accent/40 bg-accent-soft px-3 py-2 text-[0.8rem] text-accent"
            >
              {testing ? "测试中…" : "测试连接"}
            </button>
            {data?.aiConfigured && !data.aiKeyFromEnv && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save({ clearAiApiKey: true })}
                className="rounded-[10px] border border-line px-3 py-2 text-[0.8rem] text-ink-muted"
              >
                清除 Key
              </button>
            )}
          </div>
        </div>

        <div className="border-b border-line py-3 text-[0.88rem]">
          <div className="mb-2">维度管理</div>
          <div className="grid gap-2">
            {(data?.dimensions || []).map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-[10px] border border-line bg-bg-elevated px-3 py-2"
              >
                <div>
                  <div className="text-[0.85rem]">{d.name}</div>
                  <div className="text-[0.7rem] text-ink-muted">
                    {d.sensitive ? "敏感 · 默认不上 AI" : d.type}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[0.72rem] text-ink-muted">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={d.enabled}
                      onChange={(e) =>
                        void save({
                          dimensions: [{ id: d.id, enabled: e.target.checked }],
                        })
                      }
                    />
                    启用
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={d.sensitive}
                      onChange={(e) =>
                        void save({
                          dimensions: [
                            { id: d.id, sensitive: e.target.checked },
                          ],
                        })
                      }
                    />
                    敏感
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-b border-line py-3 text-[0.88rem]">
          <div>今天别问了</div>
          <button
            type="button"
            disabled={data?.quietToday}
            onClick={() => void save({ quietToday: true })}
            className="mt-2 rounded-[10px] border border-line px-3 py-2 text-[0.8rem] text-ink-muted disabled:opacity-50"
          >
            {data?.quietToday ? "今天已静音软问" : "静音今天的软问"}
          </button>
        </div>

        <div className="border-b border-line py-3 text-[0.88rem]">
          <div>导出备份</div>
          <button
            type="button"
            onClick={() => void exportBackup()}
            className="mt-2 rounded-[10px] border border-line px-3 py-2 text-[0.8rem] text-accent"
          >
            下载 JSON
          </button>
        </div>

        <div className="py-3 text-[0.78rem] leading-relaxed text-ink-muted">
          Emolog
          不是医疗或心理诊疗产品，不能替代专业帮助。有自伤风险时请联系身边的人或当地求助热线。
        </div>

        {msg && (
          <p
            className={`mb-2 text-center text-[0.75rem] ${msgBad ? "text-[#c47a6a]" : "text-ok"}`}
          >
            {msg}
          </p>
        )}

        <div className="grid gap-2">
          <button
            type="button"
            className="w-full rounded-[10px] bg-accent py-3 font-semibold text-bg"
            onClick={onClose}
          >
            完成
          </button>
          <button
            type="button"
            className="w-full rounded-[10px] border border-line py-2.5 text-[0.85rem] text-ink-muted"
            onClick={() => void logout()}
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
