"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkView } from "@/lib/view";
import { SceneVisual } from "@/components/stage/SceneVisual";

/**
 * シアター（没入）モード（§3.7 / Phase 2）。
 * 全画面・自動進行（TIMELINE_ITEM の duration）でコマ／動画を連続再生する。
 * スクロール同期ではなく再生が現在シーンを駆動する（ユーザー設定でモード切替）。
 */
export function ImmersivePlayer({
  view,
  onAnimate,
}: {
  view: WorkView;
  onAnimate?: (sceneId: string) => void;
}) {
  const scenes = view.work.scenes;
  const timeline = view.timeline;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const clampIndex = useCallback(
    (i: number) => Math.max(0, Math.min(scenes.length - 1, i)),
    [scenes.length],
  );

  // 自動進行。
  useEffect(() => {
    if (!playing) return;
    const dur = timeline[index]?.durationSec ?? 4;
    const id = setTimeout(() => {
      setIndex((i) => {
        if (i >= scenes.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, dur * 1000);
    return () => clearTimeout(id);
  }, [playing, index, timeline, scenes.length]);

  const scene = scenes[index];
  if (!scene) return null;

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  return (
    <div className="player" ref={containerRef}>
      <div className="player__stage">
        <SceneVisual scene={scene} />
        <div className="player__caption">{scene.summary}</div>
      </div>

      <div className="player__controls">
        <button className="btn btn--ghost btn--sm" onClick={() => setIndex((i) => clampIndex(i - 1))}>
          ⏮
        </button>
        <button className="btn btn--sm" onClick={() => setPlaying((p) => !p)}>
          {playing ? "⏸ 一時停止" : "▶ 再生"}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => setIndex((i) => clampIndex(i + 1))}>
          ⏭
        </button>
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          {index + 1} / {scenes.length}
        </span>
        {scene.status === "image_ready" && onAnimate && (
          <button className="btn btn--ghost btn--sm" onClick={() => onAnimate(scene.id)}>
            ▶ 動かす
          </button>
        )}
        <button className="btn btn--ghost btn--sm" onClick={toggleFullscreen}>
          ⛶ 全画面
        </button>
      </div>
    </div>
  );
}
