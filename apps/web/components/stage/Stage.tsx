"use client";

import type { Scene } from "@novel-theater/types";
import { SceneVisual } from "@/components/stage/SceneVisual";

/** 右ペインのステージ（読書同期モード）。コマ絵/動画＋アクション。 */
export function Stage({
  scene,
  onRegenerate,
  onAnimate,
}: {
  scene: Scene | null;
  onRegenerate?: (sceneId: string) => void;
  onAnimate?: (sceneId: string) => void;
}) {
  if (!scene) {
    return (
      <div className="stage">
        <div className="stage__placeholder">スクロールするとシーンが表示されます</div>
      </div>
    );
  }

  const hasImage = scene.assets.some((a) => a.kind === "image" && a.status === "ready");
  const isVideo = scene.status === "video_ready";
  const canAnimate = hasImage && !isVideo && scene.status !== "video_generating";
  const canRetry = scene.status === "failed";

  return (
    <div className="stage">
      <div className="stage__frame">
        <SceneVisual scene={scene} />
      </div>
      <div className="stage__meta muted">
        <span>
          #{scene.orderIndex} ・ {scene.summary || "(無題のシーン)"}
        </span>
        <span style={{ display: "flex", gap: "0.4rem" }}>
          {canRetry && onRegenerate && (
            <button className="btn btn--sm" onClick={() => onRegenerate(scene.id)}>
              再生成
            </button>
          )}
          {scene.status === "video_generating" && <span>動画生成中…</span>}
          {canAnimate && onAnimate && (
            <button className="btn btn--ghost btn--sm" onClick={() => onAnimate(scene.id)}>
              ▶ このコマを動かす
            </button>
          )}
          {isVideo && onAnimate && (
            <button className="btn btn--ghost btn--sm" onClick={() => onAnimate(scene.id)}>
              ↻ 再動画化
            </button>
          )}
          {hasImage && onRegenerate && (
            <button className="btn btn--ghost btn--sm" onClick={() => onRegenerate(scene.id)}>
              ↻ 絵
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
