"use client";

import { useState } from "react";
import { likeWork } from "@/lib/client";
import { VISIBILITIES, type Visibility } from "@/lib/visibility";

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
    // ボタンはリクエスト中 disabled なので、サーバーの確定値だけを反映すれば十分。
    setLiking(true);
    try {
      setLikes(await likeWork(workId));
    } catch {
      /* 一時的な失敗は無視（次の操作で再試行できる） */
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
