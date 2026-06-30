"use client";

import { useState } from "react";
import type { Work } from "@novel-theater/types";
import { likeWork } from "@/lib/client";

type Visibility = Work["visibility"];

const VISIBILITIES: Array<{ id: Visibility; label: string }> = [
  { id: "private", label: "非公開（自分のみ）" },
  { id: "unlisted", label: "限定公開（URL を知る人）" },
  { id: "public", label: "公開（ギャラリー掲載）" },
];

/**
 * 作品単位の操作バー（Phase 4 §10）。
 * - 所有者: 公開範囲の変更
 * - 全閲覧者: いいね、HTML / Markdown エクスポート、共有リンクのコピー（非公開を除く）
 */
export function WorkActions({
  workId,
  visibility,
  canEdit,
  likeCount,
  onChangeVisibility,
}: {
  workId: string;
  visibility: Visibility;
  canEdit: boolean;
  likeCount: number;
  onChangeVisibility: (v: Visibility) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [likes, setLikes] = useState(likeCount);
  const [liking, setLiking] = useState(false);

  async function copyShareLink() {
    try {
      const url = `${window.location.origin}/theater/${workId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボード不可の環境では無視 */
    }
  }

  async function onLike() {
    setLiking(true);
    setLikes((n) => n + 1); // 楽観更新
    try {
      const count = await likeWork(workId);
      setLikes(count);
    } catch {
      setLikes((n) => Math.max(0, n - 1)); // 失敗時はロールバック
    } finally {
      setLiking(false);
    }
  }

  return (
    <div className="workactions">
      {canEdit && (
        <label className="workactions__vis">
          <span className="muted">公開範囲</span>
          <select value={visibility} onChange={(e) => onChangeVisibility(e.target.value as Visibility)}>
            {VISIBILITIES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <button className="btn btn--ghost btn--sm" onClick={onLike} disabled={liking}>
        ♥ いいね {likes}
      </button>

      <a className="btn btn--ghost btn--sm" href={`/api/works/${workId}/export?format=html`} download>
        ⬇ HTML
      </a>
      <a className="btn btn--ghost btn--sm" href={`/api/works/${workId}/export?format=md`} download>
        ⬇ Markdown
      </a>

      {visibility !== "private" && (
        <button className="btn btn--ghost btn--sm" onClick={copyShareLink}>
          {copied ? "コピーしました" : "🔗 共有リンク"}
        </button>
      )}
    </div>
  );
}
