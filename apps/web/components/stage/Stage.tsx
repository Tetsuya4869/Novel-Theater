"use client";

import { useState } from "react";
import type { Scene } from "@novel-theater/types";
import { SceneVisual } from "@/components/stage/SceneVisual";

/** 右ペインのステージ（読書同期モード）。コマ絵/動画＋アクション＋編集。 */
export function Stage({
  scene,
  pending = false,
  onRegenerate,
  onAnimate,
  onNarrate,
  onSavePrompt,
}: {
  scene: Scene | null;
  /** このシーンの操作が実行中か（連打による多重ジョブ投入を防ぐ）。 */
  pending?: boolean;
  onRegenerate?: (sceneId: string) => void;
  onAnimate?: (sceneId: string) => void;
  onNarrate?: (sceneId: string) => void;
  onSavePrompt?: (sceneId: string, prompt: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!scene) {
    return (
      <div className="stage">
        <div className="stage__placeholder">スクロールするとシーンが表示されます</div>
      </div>
    );
  }

  const hasImage = scene.assets.some((a) => a.kind === "image" && a.status === "ready");
  const audio = scene.assets.find((a) => a.kind === "audio" && a.status === "ready");
  const isVideo = scene.status === "video_ready";
  // 実行中（クリック直後 or 生成中）は操作を受け付けない。
  const busy =
    pending || scene.status === "image_generating" || scene.status === "video_generating";
  const canAnimate = hasImage && !isVideo && scene.status !== "video_generating";
  const canRetry = scene.status === "failed";

  return (
    <div className="stage">
      <div className="stage__frame">
        <SceneVisual scene={scene} />
      </div>

      {audio && (
        <div className="stage__audio">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={audio.storageUrl} style={{ width: "100%" }} />
        </div>
      )}

      <div className="stage__meta muted">
        <span>
          #{scene.orderIndex} ・ {scene.summary || "(無題のシーン)"}
        </span>
        <span style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
          {pending && <span aria-live="polite">⏳ 処理中…</span>}
          {canRetry && onRegenerate && (
            <button className="btn btn--sm" disabled={busy} onClick={() => onRegenerate(scene.id)}>
              {pending ? "再生成中…" : "再生成"}
            </button>
          )}
          {scene.status === "video_generating" && <span>動画生成中…</span>}
          {canAnimate && onAnimate && (
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onAnimate(scene.id)}>
              ▶ 動かす
            </button>
          )}
          {hasImage && onRegenerate && (
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onRegenerate(scene.id)}>
              ↻ 絵
            </button>
          )}
          {!audio && onNarrate && (
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onNarrate(scene.id)}>
              🔊 ナレーション
            </button>
          )}
          {onSavePrompt && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => {
                // 未生成シーンは imagePrompt が空なので summary を初期値にする。
                setDraft(scene.imagePrompt || scene.summary);
                setEditing((v) => !v);
              }}
            >
              ✎ プロンプト
            </button>
          )}
        </span>
      </div>

      {editing && onSavePrompt && (
        <div className="stage__editor">
          <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
            <button
              className="btn btn--sm"
              disabled={!draft.trim() || busy}
              onClick={() => {
                if (!draft.trim()) return;
                onSavePrompt(scene.id, draft.trim());
                setEditing(false);
              }}
            >
              保存して再生成
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
