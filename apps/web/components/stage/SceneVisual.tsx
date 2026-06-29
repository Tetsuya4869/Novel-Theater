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

/** シーンのビジュアル本体。動画アセットがあれば動画、無ければコマ絵を表示する。 */
export function SceneVisual({ scene }: { scene: Scene }) {
  const video = scene.status === "video_ready"
    ? scene.assets.find((a) => a.kind === "video" && a.status === "ready")
    : undefined;
  const image = scene.assets.find((a) => a.kind === "image" && a.status === "ready");

  if (video) {
    const ct = String((video.meta as { contentType?: string }).contentType ?? "");
    if (ct.includes("svg")) {
      // ダミー動画（アニメーション SVG）。
      // eslint-disable-next-line @next/next/no-img-element
      return <img className="visual" src={video.storageUrl} alt={scene.summary} />;
    }
    return (
      <video className="visual" src={video.storageUrl} autoPlay muted loop playsInline />
    );
  }

  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="visual ken-burns" src={image.storageUrl} alt={scene.summary} />;
  }

  return <div className="stage__placeholder">{STATUS_LABEL[scene.status] || "準備中…"}</div>;
}
