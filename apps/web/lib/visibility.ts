import type { Visibility } from "@novel-theater/types";

export type { Visibility };

/** セレクタ用の公開範囲（長い説明ラベル）。Composer / WorkActions で共有。 */
export const VISIBILITIES: ReadonlyArray<{ id: Visibility; label: string }> = [
  { id: "private", label: "非公開（自分のみ）" },
  { id: "unlisted", label: "限定公開（URL を知る人）" },
  { id: "public", label: "公開（ギャラリー掲載）" },
];

/** カード表示用の短いラベル。 */
export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: "非公開",
  unlisted: "限定公開",
  public: "公開",
};

/** 実行時の値が Visibility か検証する（外部入力のバリデーション用）。 */
export function isVisibility(v: unknown): v is Visibility {
  return v === "private" || v === "unlisted" || v === "public";
}
