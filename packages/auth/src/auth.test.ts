import { describe, it, expect } from "vitest";
import { signSession, verifySession, newUserId } from "./index";

const SECRET = "test-secret";

describe("session token", () => {
  it("署名→検証で往復できる", () => {
    const s = { userId: newUserId(), name: "アリス" };
    const token = signSession(s, SECRET);
    expect(verifySession(token, SECRET)).toEqual(s);
  });

  it("改竄/別シークレットは拒否する", () => {
    const token = signSession({ userId: "u1", name: "x" }, SECRET);
    expect(verifySession(token, "other")).toBeNull();
    expect(verifySession(token + "x", SECRET)).toBeNull();
    expect(verifySession("garbage", SECRET)).toBeNull();
    expect(verifySession(undefined, SECRET)).toBeNull();
  });

  it("ペイロード改竄を検出する", () => {
    const token = signSession({ userId: "u1", name: "x" }, SECRET);
    const tampered = Buffer.from(JSON.stringify({ userId: "admin", name: "x" })).toString("base64url") +
      "." + token.split(".")[1];
    expect(verifySession(tampered, SECRET)).toBeNull();
  });

  it("非 ASCII の署名でもクラッシュせず null を返す（バイト長ガード）", () => {
    // 署名部を非 ASCII 43 文字にすると、文字列長は expected と一致しうるがバイト長は異なる。
    const token = signSession({ userId: "u1", name: "x" }, SECRET);
    const payload = token.slice(0, token.lastIndexOf("."));
    const crafted = `${payload}.${"あ".repeat(43)}`;
    expect(() => verifySession(crafted, SECRET)).not.toThrow();
    expect(verifySession(crafted, SECRET)).toBeNull();
  });

  it("期限切れトークンは拒否する", () => {
    const now = 1_000_000_000_000;
    const token = signSession({ userId: "u1", name: "x" }, SECRET, { nowMs: now, maxAgeSec: 60 });
    // 30 秒後は有効、120 秒後は失効。
    expect(verifySession(token, SECRET, { nowMs: now + 30_000 })).toEqual({ userId: "u1", name: "x" });
    expect(verifySession(token, SECRET, { nowMs: now + 120_000 })).toBeNull();
  });
});
