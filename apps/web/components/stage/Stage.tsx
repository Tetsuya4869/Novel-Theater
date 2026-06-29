"use client";

import type { Scene } from "@novel-theater/types";

const STATUS_LABEL: Record<string, string> = {
  pending: "未生成",
  captioned: "生成待ち…",
  image_generating: "生成中…",
  image_ready: "",
  video_generating: "動画生成中…",
  video_ready: "",
  failed: "生成に失敗しました",
  placeholder: "コスト上限に達しました",
};

/** 現在のシーンのビジュアル（右ペイン）。擬似アニメ（Ken Burns）対応。 */
export function Stage({
  scene,
  onRegenerate,
}: {
  scene: Scene | null;
  onRegenerate?: (sceneId: string) => void;
}) {
  if (!scene) {
    return (
      <div className="stage">
        <div className="stage__placeholder">スクロールするとシーンが表示されます</div>
      </div>
    );
  }
  const image = scene.assets.find((a) => a.kind === "image" && a.status === "ready");
  const canRetry = scene.status === "failed";

  return (
    <div className="stage">
      {image ? (
        <div className="stage__frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ken-burns" src={image.storageUrl} alt={scene.summary} />
        </div>
      ) : (
        <div className="stage__placeholder">
          <div>{STATUS_LABEL[scene.status] || "準備中…"}</div>
          {canRetry && onRegenerate && (
            <button className="btn btn--sm" onClick={() => onRegenerate(scene.id)} style={{ marginTop: "0.75rem" }}>
              再生成
            </button>
          )}
        </div>
      )}
      <div className="stage__meta muted">
        <span>
          #{scene.orderIndex} ・ {scene.summary || "(無題のシーン)"}
        </span>
        {image && onRegenerate && (
          <button className="btn btn--ghost btn--sm" onClick={() => onRegenerate(scene.id)}>
            ↻ 再生成
          </button>
        )}
      </div>
    </div>
  );
}
