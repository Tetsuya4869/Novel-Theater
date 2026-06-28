/**
 * テキスト正規化（§7.2）。
 * Phase 0 は保守的: 改行コードの統一・行末空白の除去・空行の圧縮のみ。
 * 全角/半角・ルビ・縦書きの変換は日本語レイアウトを壊しうるため将来段階で扱う。
 *
 * シーンの sourceStart/sourceEnd はこの正規化後テキストに対して付与する。
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n") // CRLF / CR -> LF
    .replace(/[ \t]+\n/g, "\n") // 行末空白除去
    .replace(/\n{3,}/g, "\n\n") // 3 連以上の改行を 1 空行へ
    .trim();
}
