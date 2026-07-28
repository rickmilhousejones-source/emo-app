"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginClient() {
  const router = useRouter();
  const search = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }
      const from = search.get("from") || "/";
      router.replace(from);
      router.refresh();
    } catch {
      setError("网络出了点问题");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6">
      <div className="mb-8">
        <div className="font-display text-[0.72rem] uppercase tracking-[0.16em] text-accent">
          Emolog
        </div>
        <h1 className="mt-2 text-2xl font-semibold">私人入口</h1>
        <p className="mt-2 text-[0.88rem] leading-relaxed text-ink-muted">
          一人用、门锁密码。记不住就去服务器环境变量里看你自己设的那串。
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3">
        <label className="grid gap-1.5 text-[0.82rem] text-ink-muted">
          密码
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-[12px] border border-line bg-bg-elevated px-3 py-3 text-[0.95rem] text-ink outline-none focus:border-accent/50"
          />
        </label>
        {error && (
          <p className="text-[0.82rem] text-[#c47a6a]" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-1 rounded-[12px] bg-accent py-3 font-semibold text-bg disabled:opacity-50"
        >
          {loading ? "开门中…" : "进入"}
        </button>
      </form>

      <p className="mt-8 text-center text-[0.72rem] leading-relaxed text-ink-muted">
        Emolog 不是医疗或心理诊疗工具，只是你的私人手账。
      </p>
    </div>
  );
}
