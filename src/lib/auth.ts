import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/session";

export {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
};

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

export function getPasswordHash(): string {
  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash) {
    throw new Error("缺少 APP_PASSWORD_HASH 环境变量");
  }
  return hash;
}

export async function verifyPassword(password: string): Promise<boolean> {
  return bcrypt.compare(password, getPasswordHash());
}
