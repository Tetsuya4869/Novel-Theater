import { cookies } from "next/headers";
import { loadEnv } from "@novel-theater/config";
import { verifySession, type Session } from "@novel-theater/auth";

/**
 * サーバー側のセッション読み取り（Phase 4 §10「広げる」/ §5.2）。
 * HMAC 署名付き Cookie（@novel-theater/auth）で軽量にユーザーを識別する開発用認証。
 * 本番は Auth.js / Clerk / Supabase Auth に差し替える（interface は Session のみ）。
 */
export const SESSION_COOKIE = "nt_session";

/** Cookie 共通オプション（30 日有効、HttpOnly）。 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

function secret(): string {
  return loadEnv().NT_AUTH_SECRET;
}

/** 現在のリクエストのセッションを返す（未ログインは null）。 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value, secret());
}

export { secret as authSecret };
