"use client";

import type { Scene } from "@novel-theater/types";

const STATUS_LABEL: Record<string, string> = {
  pending: "未生成",
  captioned: "シーン化済み（画像未生成）",
  image_generating: "生成中…",
  image_ready: "",
  video_generating: "動画生成中…",
  video_ready: "",
  failed: "生成に失敗しました",
  placeholder: "プレースホルダ",
};

/** 現在のシーンのビジュアルを表示する（右ペイン）。 */
export function Stage({ scene }: { scene: Scene | null }) {
  if (!scene) {
    return (
      <div className="stage">
        <div className="stage__placeholder">スクロールするとシーンが表示されます</div>
      </div>
    );
  }
  const image = scene.assets.find((a) => a.kind === "image" && a.status === "ready");
  return (
    <div className="stage">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.storageUrl} alt={scene.summary} />
      ) : (
        <div className="stage__placeholder">
          {STATUS_LABEL[scene.status] || "準備中…"}
        </div>
      )}
      <div className="stage__meta muted">
        #{scene.orderIndex} ・ {scene.summary || "(無題のシーン)"}
      </div>
    </div>
  );
}
