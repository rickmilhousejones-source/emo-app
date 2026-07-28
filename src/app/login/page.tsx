import { Suspense } from "react";
import { LoginClient } from "./login-client";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-ink-muted">
          加载中…
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
