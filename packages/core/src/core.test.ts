import { describe, it, expect } from "vitest";
import { normalizeText } from "./normalize";
import { normalizeAozora } from "./aozora";
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

describe("normalizeAozora", () => {
  it("ルビ（《…》と起点 ｜）を除去して親文字を残す", () => {
    expect(normalizeAozora("吾輩《わがはい》は猫である")).toBe("吾輩は猫である");
    expect(normalizeAozora("｜時鳥《ほととぎす》が鳴く")).toBe("時鳥が鳴く");
  });

  it("入力注記・外字注記（※［＃…］）を除去する", () => {
    expect(normalizeAozora("本文［＃改ページ］の続き")).toBe("本文の続き");
    expect(normalizeAozora("文字※［＃「○」、第3水準1-2-3］と続く")).toBe("文字と続く");
  });

  it("先頭の凡例ブロック（ダッシュ行で囲まれた説明）を除去する", () => {
    const src = [
      "見出し",
      "-------------------------------------------------------",
      "【テキスト中に現れる記号について】",
      "《》：ルビ",
      "-------------------------------------------------------",
      "",
      "本文が始まる。",
    ].join("\n");
    const out = normalizeAozora(src);
    expect(out).not.toContain("ルビ");
    expect(out).not.toContain("---");
    expect(out).toContain("本文が始まる。");
    expect(out).toContain("見出し");
  });

  it("末尾の奥付（底本：…）以降を除去する", () => {
    const src = "本文の最後。\n\n底本：「夏目漱石全集」\n　　　1990年";
    expect(normalizeAozora(src)).toBe("本文の最後。");
  });

  it("通常テキストはルビ等が無ければそのまま（normalizeText 相当）", () => {
    expect(normalizeAozora("a  \r\nb\r\n")).toBe("a\nb");
  });
});
