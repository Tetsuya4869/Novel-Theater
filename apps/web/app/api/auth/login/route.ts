import { NextResponse } from "next/server";
import { newUserId, signSession } from "@novel-theater/auth";
import { authSecret, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/session";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * 開発用ログイン（§10 アカウント）。表示名だけで HMAC 署名セッションを発行する。
 * 既存セッションがあれば userId を維持して名前のみ更新する。
 * 本番は OAuth / メールリンク等に差し替える。
 */
export async function POST(req: Request) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON ボディが不正です" }, { status: 400 });
  }
  const name = (body.name ?? "").trim().slice(0, 40);
  if (!name) {
    return NextResponse.json({ error: "表示名を入力してください" }, { status: 400 });
  }

  const existing = await getSession();
  const session = { userId: existing?.userId ?? newUserId(), name };
  const token = signSession(session, authSecret());

  const res = NextResponse.json({ ok: true, user: session });
  res.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  return res;
}
