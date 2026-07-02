import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * 軽量なセッション署名（Phase 4）。
 * HMAC 署名付き Cookie でユーザーを識別する開発用認証。外部依存なし。
 * 本番は Auth.js / Clerk / Supabase Auth に差し替える（§5.2 / Phase 4）。
 */
export interface Session {
  userId: string;
  name: string;
}

/** 署名ペイロード（Session に発行/失効時刻を付す）。 */
interface SignedPayload extends Session {
  iat: number;
  exp: number;
}

const DEFAULT_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 日

/** 新規ユーザー ID を発行する。 */
export function newUserId(): string {
  return `usr_${randomUUID()}`;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/** セッションを署名付きトークン（`<payload>.<sig>`）にする。有効期限を埋め込む。 */
export function signSession(
  session: Session,
  secret: string,
  opts: { nowMs?: number; maxAgeSec?: number } = {},
): string {
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const body: SignedPayload = {
    userId: session.userId,
    name: session.name,
    iat: nowSec,
    exp: nowSec + (opts.maxAgeSec ?? DEFAULT_MAX_AGE_SEC),
  };
  const payload = base64url(JSON.stringify(body));
  return `${payload}.${sign(payload, secret)}`;
}

/** トークンを検証し、改竄・期限切れでなければ Session を返す。 */
export function verifySession(
  token: string | undefined,
  secret: string,
  opts: { nowMs?: number } = {},
): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload, secret);
  // timingSafeEqual はバイト長が違うと投げるため、Buffer 化してバイト長で先に弾く
  // （文字列長で比較すると非 ASCII 署名でクラッシュしうる）。
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SignedPayload>;
    if (typeof parsed.userId !== "string" || typeof parsed.name !== "string") return null;
    // 有効期限（exp を持つトークンのみ）。期限切れは無効。
    if (typeof parsed.exp === "number") {
      const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
      if (parsed.exp < nowSec) return null;
    }
    return { userId: parsed.userId, name: parsed.name };
  } catch {
    return null;
  }
}
