import { describe, it, expect } from "vitest";
import { normalizeText } from "./normalize";
import { contentHash, sha256 } from "./hash";
import { splitIntoParagraphs, sceneIndexAtOffset } from "./scenes";

describe("normalizeText", () => {
  it("CRLF を LF に統一し行末空白を除去する", () => {
    expect(normalizeText("a  \r\nb\r\n")).toBe("a\nb");
  });
  it("3 連以上の改行を 1 空行へ圧縮する", () => {
    expect(normalizeText("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("hash", () => {
  it("sha256 は決定的", () => {
    expect(sha256("x")).toBe(sha256("x"));
    expect(sha256("x")).not.toBe(sha256("y"));
  });
  it("contentHash は入力差で変化する", () => {
    expect(contentHash(["a", 1, true])).toBe(contentHash(["a", 1, true]));
    expect(contentHash(["a", 1])).not.toBe(contentHash(["a", 2]));
  });
});

describe("splitIntoParagraphs", () => {
  it("オフセットが実テキストと一致する", () => {
    const text = "一段落目。\n\n  二段落目。  \n\n三段落目。";
    const spans = splitIntoParagraphs(text);
    expect(spans).toHaveLength(3);
    for (const s of spans) {
      expect(text.slice(s.start, s.end)).toBe(s.text);
      expect(s.text).not.toMatch(/^\s|\s$/);
    }
    expect(spans[1]!.text).toBe("二段落目。");
  });

  it("単一段落でも全体を 1 スパンで返す", () => {
    const spans = splitIntoParagraphs("ただ一段落のみ。");
    expect(spans).toHaveLength(1);
    expect(spans[0]!.start).toBe(0);
  });
});

describe("sceneIndexAtOffset", () => {
  const scenes = [
    { sourceStart: 0, sourceEnd: 10 },
    { sourceStart: 10, sourceEnd: 25 },
    { sourceStart: 25, sourceEnd: 40 },
  ];
  it("オフセットから該当シーンを二分探索する", () => {
    expect(sceneIndexAtOffset(scenes, 0)).toBe(0);
    expect(sceneIndexAtOffset(scenes, 9)).toBe(0);
    expect(sceneIndexAtOffset(scenes, 10)).toBe(1);
    expect(sceneIndexAtOffset(scenes, 39)).toBe(2);
  });
  it("範囲外は -1", () => {
    expect(sceneIndexAtOffset(scenes, 100)).toBe(-1);
  });
});
