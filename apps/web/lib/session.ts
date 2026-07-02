import { cache } from "react";
import { cookies } from "next/headers";
import { loadEnv } from "@novel-theater/config";
import { verifySession, type Session } from "@novel-theater/auth";

/**
 * サーバー側のセッション読み取り（Phase 4 §10「広げる」/ §5.2）。
 * HMAC 署名付き Cookie（@novel-theater/auth）で軽量にユーザーを識別する開発用認証。
 * 本番は Auth.js / Clerk / Supabase Auth に差し替える（interface は Session のみ）。
 */
export const SESSION_COOKIE = "nt_session";

/** Cookie 共通オプション（30 日有効、HttpOnly、本番は Secure）。 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
  // 本番は HTTPS のみで送出（平文 http での漏洩を防ぐ）。
  secure: process.env.NODE_ENV === "production",
};

function secret(): string {
  return loadEnv().NT_AUTH_SECRET;
}

/**
 * 現在のリクエストのセッションを返す（未ログインは null）。
 * React cache でリクエスト内の重複呼び出し（layout + page + guard 等）を 1 回にまとめる。
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value, secret());
});

export { secret as authSecret };
