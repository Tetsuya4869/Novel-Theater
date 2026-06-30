import { normalizeText } from "./normalize";

/**
 * 青空文庫（Aozora Bunko）記法の取り込み正規化（Phase 4 §4.1 / §10 インポート）。
 *
 * 青空文庫形式のテキストを、シーン分割に適した素のテキストへ保守的に変換する:
 * - ルビ（`漢字《かんじ》`、起点マーカー `｜`）を除去して親文字だけ残す
 * - 入力注記・外字注記（`※［＃…］`）を除去
 * - 先頭の凡例ブロック（ダッシュ行で囲まれた説明）を除去
 * - 末尾の奥付（`底本：…`）を除去
 *
 * 最後に通常の {@link normalizeText} を通す。判定は保守的で、誤って本文を削らないことを優先する。
 */

/** ダッシュのみ（長音 ー は除外）で構成される区切り行。凡例ブロックの境界に使う。 */
const DASH_LINE = /^[ \t　]*[-‐‑‒–—―─]{8,}[ \t　]*$/;

export function normalizeAozora(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n");

  // 1. 先頭の凡例ブロック（最初の 2 本のダッシュ行とその間）を除去。
  //    奥付側のダッシュ行を誤検出しないよう、先頭付近のみ走査する。
  const lines = text.split("\n");
  const dashIdx: number[] = [];
  for (let i = 0; i < lines.length && i < 40; i++) {
    if (DASH_LINE.test(lines[i]!)) dashIdx.push(i);
  }
  if (dashIdx.length >= 2) {
    lines.splice(dashIdx[0]!, dashIdx[1]! - dashIdx[0]! + 1);
    text = lines.join("\n");
  }

  // 2. 末尾の奥付（底本：…）以降を除去。
  text = text.replace(/\n[ \t　]*底本[：:][\s\S]*$/u, "\n");

  // 3. ルビ・注記を除去。
  text = text
    .replace(/｜/g, "") // ルビ起点マーカー
    .replace(/《[^》]*》/g, "") // ルビ本体
    .replace(/※?［＃[^］]*］/g, ""); // 入力注記・外字注記

  return normalizeText(text);
}
