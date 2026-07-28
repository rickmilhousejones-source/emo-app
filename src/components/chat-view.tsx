"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Msg = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

function deviceTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function ChatView() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [quietToday, setQuietToday] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const showChips = quickReplies.length > 0;

  const scrollDown = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const tz = deviceTz();
        const [msgRes, setRes] = await Promise.all([
          fetch(`/api/messages?tz=${encodeURIComponent(tz || "")}`),
          fetch(`/api/settings?tz=${encodeURIComponent(tz || "")}`),
        ]);
        if (!msgRes.ok || !setRes.ok) throw new Error("加载失败");
        const msgData = (await msgRes.json()) as { messages: Msg[] };
        const setData = (await setRes.json()) as { quietToday: boolean };
        if (!cancelled) {
          setMessages(msgData.messages || []);
          setQuietToday(setData.quietToday);
        }
      } catch {
        if (!cancelled) setError("没法加载今天的对话");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollDown();
  }, [messages, quickReplies, scrollDown]);

  async function setQuiet() {
    const tz = deviceTz();
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quietToday: true, tz }),
    });
    setQuietToday(true);
    setQuickReplies([]);
  }

  async function sendMessage(text: string, forceLogging = false) {
    const content = text.trim();
    if (!content || streaming) return;
    setError("");
    setInput("");
    setQuickReplies([]);
    const tempId = `local-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: "user", content }]);
    setStreaming(true);

    const assistantId = `stream-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          tz: deviceTz(),
          forceLogging,
        }),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "发送失败");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let latestReply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          const data = JSON.parse(dataLine) as {
            text?: string;
            reply?: string;
            quick_replies?: string[];
            error?: string;
            userMessageId?: string;
            assistantMessageId?: string;
          };
          if (event === "delta" && data.text != null) {
            latestReply = data.text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: data.text! } : m,
              ),
            );
          }
          if (event === "final") {
            latestReply = data.reply || latestReply;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id === tempId && data.userMessageId) {
                  return { ...m, id: data.userMessageId };
                }
                if (m.id === assistantId) {
                  return {
                    ...m,
                    id: data.assistantMessageId || m.id,
                    content: latestReply,
                  };
                }
                return m;
              }),
            );
            setQuickReplies(data.quick_replies || []);
          }
          if (event === "error") {
            throw new Error(data.error || "AI 出错了");
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "发送失败";
      setError(message);
      setMessages((prev) =>
        prev.filter((m) => m.id !== assistantId || m.content),
      );
    } finally {
      setStreaming(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-ink-muted">
        打开今天的本子…
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="max-w-[88%] self-start rounded-2xl rounded-bl border border-line bg-ai px-3 py-2.5 text-[0.88rem] leading-relaxed animate-[rise_0.35s_ease]">
            <span className="mb-1 block text-[0.66rem] text-ink-muted">AI</span>
            晚上好。今天想先倒点什么都可以——我偶尔会软问一句，不想理就略过。
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div
              key={m.id}
              className="max-w-[88%] self-end rounded-2xl rounded-br border border-transparent bg-user px-3 py-2.5 text-[0.88rem] leading-relaxed animate-[rise_0.25s_ease]"
            >
              {m.content}
            </div>
          ) : m.role === "assistant" ? (
            <div
              key={m.id}
              className="max-w-[88%] self-start rounded-2xl rounded-bl border border-line bg-ai px-3 py-2.5 text-[0.88rem] leading-relaxed animate-[rise_0.25s_ease]"
            >
              <span className="mb-1 block text-[0.66rem] text-ink-muted">AI</span>
              {m.content || (streaming ? "…" : "")}
            </div>
          ) : null,
        )}
        {error && (
          <p className="self-center text-[0.75rem] text-[#c47a6a]">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2">
        <button
          type="button"
          disabled={quietToday || streaming}
          onClick={() => void setQuiet()}
          className="whitespace-nowrap rounded-full border border-line bg-bg-elevated px-2.5 py-1.5 text-[0.72rem] text-ink-muted disabled:opacity-50"
        >
          {quietToday ? "今天已静音" : "今天别问了"}
        </button>
        <button
          type="button"
          disabled={streaming}
          onClick={() => void sendMessage("记一下", true)}
          className="whitespace-nowrap rounded-full border border-line bg-bg-elevated px-2.5 py-1.5 text-[0.72rem] text-ink-muted disabled:opacity-50"
        >
          记一下
        </button>
      </div>

      {showChips && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              disabled={streaming}
              onClick={() => void sendMessage(q)}
              className="whitespace-nowrap rounded-full border border-accent/40 bg-accent-soft px-3 py-1.5 text-[0.75rem] text-accent transition-colors hover:border-accent"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="flex shrink-0 items-end gap-2 border-t border-line bg-[#12110f] px-3 pb-3 pt-2.5"
      >
        <textarea
          rows={1}
          placeholder="说说今天…"
          value={input}
          disabled={streaming}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage(input);
            }
          }}
          className="min-h-[42px] max-h-[90px] flex-1 resize-none rounded-[14px] border border-line bg-bg-elevated px-3 py-2.5 text-[0.88rem] leading-snug text-ink placeholder:text-ink-muted/60 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="h-[42px] w-[42px] shrink-0 rounded-xl bg-accent font-bold text-bg disabled:opacity-50"
          aria-label="发送"
        >
          ↑
        </button>
      </form>
    </>
  );
}
