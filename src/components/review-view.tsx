"use client";

import { useEffect, useState } from "react";
import { PERIOD_IDS, periodLabel, type PeriodId } from "@/lib/period";

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

type EntryRow = {
  id: string;
  phrase: string;
  dimName: string | null;
  dimensionId: string;
  silentScore: number | null;
  period: string | null;
};

type DimOpt = { id: string; name: string };

type DayDetail = {
  dayKey: string;
  label: string;
  oneLiner: string | null;
  messages: { id: string; role: string; content: string }[];
  entries: EntryRow[];
  dimensions?: DimOpt[];
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
  const height = 132;
  const padL = 22;
  const padR = 10;
  const padT = 10;
  const padB = 18;

  const n = series[0]?.points.length || 14;

  function xAt(i: number) {
    return padL + (i / Math.max(n - 1, 1)) * (width - padL - padR);
  }

  function yAt(value: number) {
    return padT + (1 - value / 10) * (height - padT - padB);
  }

  function polylinesFor(
    points: Series["points"],
    color: string,
    dashed?: boolean,
  ) {
    const segments: { x: number; y: number }[][] = [];
    let cur: { x: number; y: number }[] = [];
    points.forEach((p, i) => {
      if (p.value == null) {
        if (cur.length) {
          segments.push(cur);
          cur = [];
        }
        return;
      }
      cur.push({ x: xAt(i), y: yAt(p.value) });
    });
    if (cur.length) segments.push(cur);

    return segments.map((seg, si) => {
      if (seg.length === 1) {
        return (
          <circle
            key={`${color}-d-${si}`}
            cx={seg[0].x}
            cy={seg[0].y}
            r={3}
            fill={color}
          />
        );
      }
      return (
        <polyline
          key={`${color}-l-${si}`}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? "4 3" : undefined}
          points={seg.map((c) => `${c.x},${c.y}`).join(" ")}
        />
      );
    });
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
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-[132px] w-full">
        <line
          x1={padL}
          y1={yAt(0)}
          x2={width - padR}
          y2={yAt(0)}
          stroke="currentColor"
          strokeOpacity={0.15}
        />
        <line
          x1={padL}
          y1={yAt(5)}
          x2={width - padR}
          y2={yAt(5)}
          stroke="currentColor"
          strokeOpacity={0.08}
        />
        <line
          x1={padL}
          y1={yAt(10)}
          x2={width - padR}
          y2={yAt(10)}
          stroke="currentColor"
          strokeOpacity={0.08}
        />
        <text x={2} y={yAt(10) + 3} className="fill-current text-[8px]" opacity={0.45}>
          10
        </text>
        <text x={4} y={yAt(0) + 3} className="fill-current text-[8px]" opacity={0.45}>
          0
        </text>
        {series.map((s) =>
          polylinesFor(
            s.points,
            s.id === "anxiety" ? "#c4a574" : "#7a9e7e",
            s.id === "mood",
          ),
        )}
      </svg>
      <p className="mt-1.5 text-[0.7rem] text-ink-muted">
        左旧右新 · Y 为 0–10 静默分 · 无数据日断开。点某天可回看原话。
      </p>
    </div>
  );
}

type DraftEntry = {
  key: string;
  id?: string;
  dimensionId: string;
  phrase: string;
  silentScore: string;
  period: string;
};

export function ReviewView() {
  const [series, setSeries] = useState<Series[]>([]);
  const [days, setDays] = useState<DayItem[]>([]);
  const [selected, setSelected] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function reloadList() {
    const res = await fetch(
      `/api/review?tz=${encodeURIComponent(deviceTz() || "")}&days=14`,
    );
    if (!res.ok) throw new Error("加载失败");
    const json = (await res.json()) as { series: Series[]; days: DayItem[] };
    setSeries(json.series || []);
    setDays(json.days || []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        await reloadList();
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
    setEditing(false);
    const res = await fetch(`/api/review/${dayKey}`);
    if (!res.ok) {
      setError("打不开这一天");
      return;
    }
    const json = (await res.json()) as DayDetail;
    setSelected(json);
  }

  function startEdit() {
    if (!selected) return;
    setEditTitle(selected.oneLiner || "");
    setDeleteIds([]);
    setDrafts(
      selected.entries.map((e) => ({
        key: e.id,
        id: e.id,
        dimensionId: e.dimensionId,
        phrase: e.phrase,
        silentScore: e.silentScore != null ? String(e.silentScore) : "",
        period: e.period || "",
      })),
    );
    setEditing(true);
  }

  function addDraft() {
    const dimId = selected?.dimensions?.[0]?.id || "mood";
    setDrafts((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        dimensionId: dimId,
        phrase: "",
        silentScore: "",
        period: "evening",
      },
    ]);
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const upserts = drafts
        .filter((d) => !deleteIds.includes(d.id || "") && d.phrase.trim())
        .map((d) => ({
          id: d.id || null,
          dimensionId: d.dimensionId,
          phrase: d.phrase.trim(),
          silentScore: d.silentScore === "" ? null : Number(d.silentScore),
          period: d.period || null,
        }));

      const res = await fetch(`/api/review/${selected.dayKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oneLiner: editTitle.trim() || undefined,
          deleteEntryIds: deleteIds,
          upserts,
          regenerateSummary: !editTitle.trim(),
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      const json = (await res.json()) as DayDetail;
      setSelected(json);
      setEditing(false);
      await reloadList();
    } catch {
      setError("保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function regenTitle() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/review/${selected.dayKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateSummary: true }),
      });
      if (!res.ok) throw new Error("重算失败");
      const json = (await res.json()) as DayDetail;
      setSelected(json);
      setEditTitle(json.oneLiner || "");
      await reloadList();
    } catch {
      setError("重算标题失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-ink-muted">
        翻看近两周…
      </div>
    );
  }

  if (selected) {
    const periodOrder = ["", ...PERIOD_IDS];
    const grouped = periodOrder
      .map((p) => ({
        period: p,
        label: p ? periodLabel(p as PeriodId) : "整天",
        items: selected.entries.filter((e) => (e.period || "") === p),
      }))
      .filter((g) => g.items.length > 0);

    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-5 pt-3.5">
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setEditing(false);
          }}
          className="mb-3 text-[0.88rem] text-accent"
        >
          ← 回到列表
        </button>
        <div className="mb-1 flex items-start justify-between gap-2">
          <h2 className="text-[1.05rem] font-semibold">{selected.label}</h2>
          {!editing && (
            <button
              type="button"
              onClick={startEdit}
              className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[0.78rem] text-accent"
            >
              编辑
            </button>
          )}
        </div>

        {error && <p className="mb-2 text-[0.75rem] text-[#c47a6a]">{error}</p>}

        {editing ? (
          <div className="mt-2 space-y-3">
            <label className="block text-[0.75rem] text-ink-muted">
              一句话标题
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 w-full rounded-[10px] border border-line bg-bg-elevated px-3 py-2 text-[0.88rem] text-ink outline-none focus:border-accent/45"
              />
            </label>
            <button
              type="button"
              onClick={() => void regenTitle()}
              disabled={saving}
              className="text-[0.78rem] text-accent"
            >
              按当前维度重算标题
            </button>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[0.78rem] font-semibold text-ink-muted">
                  维度条目
                </h3>
                <button
                  type="button"
                  onClick={addDraft}
                  className="text-[0.78rem] text-accent"
                >
                  + 添加
                </button>
              </div>
              {drafts.map((d) => {
                if (d.id && deleteIds.includes(d.id)) return null;
                return (
                  <div
                    key={d.key}
                    className="rounded-[10px] border border-line bg-bg-elevated p-2.5 space-y-1.5"
                  >
                    <div className="flex gap-1.5">
                      <select
                        value={d.dimensionId}
                        onChange={(e) =>
                          setDrafts((prev) =>
                            prev.map((x) =>
                              x.key === d.key
                                ? { ...x, dimensionId: e.target.value }
                                : x,
                            ),
                          )
                        }
                        className="flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[0.8rem]"
                      >
                        {(selected.dimensions || []).map((dim) => (
                          <option key={dim.id} value={dim.id}>
                            {dim.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={d.period}
                        onChange={(e) =>
                          setDrafts((prev) =>
                            prev.map((x) =>
                              x.key === d.key
                                ? { ...x, period: e.target.value }
                                : x,
                            ),
                          )
                        }
                        className="w-[5.5rem] rounded-md border border-line bg-surface px-2 py-1 text-[0.8rem]"
                      >
                        <option value="">整天</option>
                        {PERIOD_IDS.map((p) => (
                          <option key={p} value={p}>
                            {periodLabel(p)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      value={d.phrase}
                      onChange={(e) =>
                        setDrafts((prev) =>
                          prev.map((x) =>
                            x.key === d.key
                              ? { ...x, phrase: e.target.value }
                              : x,
                          ),
                        )
                      }
                      placeholder="口语短语"
                      className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[0.85rem]"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        value={d.silentScore}
                        onChange={(e) =>
                          setDrafts((prev) =>
                            prev.map((x) =>
                              x.key === d.key
                                ? { ...x, silentScore: e.target.value }
                                : x,
                            ),
                          )
                        }
                        placeholder="静默分 0-10"
                        className="w-28 rounded-md border border-line bg-surface px-2 py-1 text-[0.8rem]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (d.id) {
                            setDeleteIds((prev) => [...prev, d.id!]);
                          }
                          setDrafts((prev) =>
                            prev.filter((x) => x.key !== d.key),
                          );
                        }}
                        className="ml-auto text-[0.75rem] text-[#c47a6a]"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveEdit()}
                className="rounded-lg bg-accent px-3 py-1.5 text-[0.85rem] text-[#1a1814]"
              >
                {saving ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditing(false)}
                className="rounded-lg border border-line px-3 py-1.5 text-[0.85rem]"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            {selected.oneLiner && (
              <p className="mt-1 text-[0.88rem] text-ink-muted">
                {selected.oneLiner}
              </p>
            )}

            {grouped.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-[0.78rem] font-semibold text-ink-muted">
                  当天记入
                </h3>
                <div className="grid gap-3">
                  {grouped.map((g) => (
                    <div key={g.period || "all"}>
                      <div className="mb-1 text-[0.72rem] text-ink-muted">
                        {g.label}
                      </div>
                      <div className="grid gap-1.5">
                        {g.items.map((e) => (
                          <div
                            key={e.id}
                            className="rounded-[10px] border border-line bg-bg-elevated px-3 py-2 text-[0.85rem]"
                          >
                            <span className="text-accent">
                              {e.dimName || "维度"}
                            </span>
                            <span className="mx-1.5 text-ink-muted">·</span>
                            {e.phrase}
                            {e.silentScore != null && (
                              <span className="ml-1.5 text-[0.72rem] text-ink-muted">
                                ({e.silentScore})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
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
            <div className="mb-1.5 text-[0.88rem] leading-snug">
              {day.oneLiner}
            </div>
            {day.dims && (
              <div className="text-[0.72rem] text-accent">{day.dims}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
