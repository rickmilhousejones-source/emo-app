import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "emolog_session";
export const SESSION_DAYS = 14;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Dev fallback so local middleware can boot; production must set real secret
    if (process.env.NODE_ENV !== "production") {
      return new TextEncoder().encode("emolog-dev-session-secret-change-me");
    }
    throw new Error("缺少 SESSION_SECRET 环境变量");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ ok: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export function sessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}
