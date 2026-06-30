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
});
