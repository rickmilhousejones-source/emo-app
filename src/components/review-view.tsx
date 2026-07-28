"use client";

import { useEffect, useState } from "react";

type Series = {
  id: string;
  name: string;
  points: { dayKey: string; value: number | null }[];
};

type DayItem = {
  dayKey: string;
  label: string;
  oneLiner: string;
  dims: string;
};

type DayDetail = {
  dayKey: string;
  label: string;
  oneLiner: string | null;
  messages: { id: string; role: string; content: string }[];
  entries: { id: string; phrase: string; dimName: string | null }[];
};

function deviceTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function TrendChart({ series }: { series: Series[] }) {
  const width = 320;
  const height = 120;
  const pad = 10;

  function pathFor(points: Series["points"], color: string, dashed?: boolean) {
    const values = points.map((p) => p.value);
    const usable = values.filter((v): v is number => v != null);
    if (usable.length === 0) return null;
    const coords = points
      .map((p, i) => {
        if (p.value == null) return null;
        const x =
          pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2);
        const y = height - pad - (p.value / 10) * (height - pad * 2);
        return `${x},${y}`;
      })
      .filter(Boolean);
    if (coords.length < 2) return null;
    return (
      <polyline
        key={color}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={dashed ? "4 3" : undefined}
        points={coords.join(" ")}
      />
    );
  }

  return (
    <div className="mb-4 rounded-[14px] border border-line bg-surface px-3 py-3.5">
      <div className="mb-2.5 flex gap-3 text-[0.7rem] text-ink-muted">
        <span className="flex items-center gap-1.5 before:inline-block before:h-2 before:w-2 before:rounded-sm before:bg-accent">
          焦虑
        </span>
        <span className="flex items-center gap-1.5 before:inline-block before:h-2 before:w-2 before:rounded-sm before:bg-ok">
          心情
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-[120px] w-full">
        {series.map((s) =>
          pathFor(s.points, s.id === "anxiety" ? "#c4a574" : "#7a9e7e", s.id === "mood"),
        )}
      </svg>
      <p className="mt-1.5 text-[0.7rem] text-ink-muted">
        折线看静默分；列表以口语短语为主。点某天可回看原话。
      </p>
    </div>
  );
}

export function ReviewView() {
  const [series, setSeries] = useState<Series[]>([]);
  const [days, setDays] = useState<DayItem[]>([]);
  const [selected, setSelected] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/review?tz=${encodeURIComponent(deviceTz() || "")}&days=14`,
        );
        if (!res.ok) throw new Error("加载失败");
        const json = (await res.json()) as {
          series: Series[];
          days: DayItem[];
        };
        if (!cancelled) {
          setSeries(json.series || []);
          setDays(json.days || []);
        }
      } catch {
        if (!cancelled) setError("回顾加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openDay(dayKey: string) {
    setError("");
    const res = await fetch(`/api/review/${dayKey}`);
    if (!res.ok) {
      setError("打不开这一天");
      return;
    }
    const json = (await res.json()) as DayDetail;
    setSelected(json);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-ink-muted">
        翻看近两周…
      </div>
    );
  }

  if (selected) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-5 pt-3.5">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="mb-3 text-[0.88rem] text-accent"
        >
          ← 回到列表
        </button>
        <h2 className="text-[1.05rem] font-semibold">{selected.label}</h2>
        {selected.oneLiner && (
          <p className="mt-1 text-[0.88rem] text-ink-muted">{selected.oneLiner}</p>
        )}

        {selected.entries.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-[0.78rem] font-semibold text-ink-muted">
              当天记入
            </h3>
            <div className="grid gap-1.5">
              {selected.entries.map((e) => (
                <div
                  key={e.id}
                  className="rounded-[10px] border border-line bg-bg-elevated px-3 py-2 text-[0.85rem]"
                >
                  <span className="text-accent">{e.dimName || "维度"}</span>
                  <span className="mx-1.5 text-ink-muted">·</span>
                  {e.phrase}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <h3 className="mb-2 text-[0.78rem] font-semibold text-ink-muted">
            原话时间线
          </h3>
          <div className="flex flex-col gap-2">
            {selected.messages.length === 0 && (
              <p className="text-[0.82rem] text-ink-muted">这天没有聊天记录。</p>
            )}
            {selected.messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[92%] rounded-2xl px-3 py-2 text-[0.85rem] leading-relaxed ${
                  m.role === "user"
                    ? "self-end bg-user"
                    : "self-start border border-line bg-ai"
                }`}
              >
                {m.content}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-5 pt-3.5">
      <h2 className="mb-2.5 text-[0.78rem] font-semibold tracking-wide text-ink-muted">
        近两周 · 静默映射（界面仍看原话）
      </h2>
      <TrendChart series={series} />

      <h2 className="mb-2.5 text-[0.78rem] font-semibold tracking-wide text-ink-muted">
        最近几天
      </h2>
      {error && <p className="mb-2 text-[0.75rem] text-[#c47a6a]">{error}</p>}
      <div className="grid gap-2">
        {days.length === 0 && (
          <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[0.82rem] text-ink-muted">
            还没有可回顾的记录。去今天聊几句、记一笔再说。
          </p>
        )}
        {days.map((day) => (
          <button
            key={day.dayKey}
            type="button"
            onClick={() => void openDay(day.dayKey)}
            className="w-full rounded-xl border border-line bg-bg-elevated p-3 text-left transition-colors hover:border-accent/40"
          >
            <div className="mb-1 text-[0.72rem] text-ink-muted">{day.label}</div>
            <div className="mb-1.5 text-[0.88rem] leading-snug">{day.oneLiner}</div>
            {day.dims && (
              <div className="text-[0.72rem] text-accent">{day.dims}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
