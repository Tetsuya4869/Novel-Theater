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

/** セッションを署名付きトークン（`<payload>.<sig>`）にする。 */
export function signSession(session: Session, secret: string): string {
  const payload = base64url(JSON.stringify(session));
  return `${payload}.${sign(payload, secret)}`;
}

/** トークンを検証し、改竄されていなければ Session を返す。 */
export function verifySession(token: string | undefined, secret: string): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload, secret);
  // 長さが違うと timingSafeEqual が投げるため先に弾く。
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (typeof parsed.userId === "string" && typeof parsed.name === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}
