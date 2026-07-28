"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SettingsSheet } from "./settings-sheet";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const isReview = pathname === "/review" || pathname.startsWith("/review/");
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5 border-b border-line px-3 pb-2.5 pt-1">
        {isReview ? (
          <Link
            href="/"
            className="col-start-1 row-span-3 self-center whitespace-nowrap px-1 py-1.5 text-[0.88rem] text-accent"
          >
            ← 今天
          </Link>
        ) : (
          <span className="col-start-1 row-span-3" aria-hidden />
        )}

        <div className="col-start-2 font-display text-[0.68rem] uppercase tracking-[0.14em] text-accent">
          Emolog
        </div>
        <h1 className="col-start-2 text-[1.05rem] font-semibold">
          {isReview ? "回顾" : "今天"}
        </h1>
        <p className="col-start-2 text-[0.72rem] text-ink-muted">
          {isReview ? "趋势 · 点进某天看原话" : "沉浸倾诉 · 软问开着"}
        </p>

        <div className="col-start-3 row-span-3 flex items-center gap-1.5 self-center">
          {!isReview && (
            <Link
              href="/review"
              className="flex h-[34px] items-center rounded-[10px] border border-line bg-bg-elevated px-3 text-[0.82rem] font-medium text-ink transition-colors hover:border-accent/45 hover:bg-accent-soft hover:text-accent"
            >
              回顾
            </Link>
          )}
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-line bg-bg-elevated text-[0.95rem] text-ink-muted transition-colors hover:border-accent/40 hover:text-accent"
            title="设置"
            aria-label="设置"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="screen-gradient flex min-h-0 flex-1 flex-col">{children}</main>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
