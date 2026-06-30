"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkView } from "@/lib/view";
import { SceneVisual } from "@/components/stage/SceneVisual";

/**
 * シアター（没入）モード（§3.7 / Phase 2-3）。
 * 全画面・自動進行（TIMELINE_ITEM の duration）。ナレーション音声があれば再生し、
 * 音声の終了でコマを進める（コマ／本文／音声の同期 §7.7）。
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const clampIndex = useCallback(
    (i: number) => Math.max(0, Math.min(scenes.length - 1, i)),
    [scenes.length],
  );

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i >= scenes.length - 1) {
        setPlaying(false);
        return i;
      }
      return i + 1;
    });
  }, [scenes.length]);

  // 自動進行: 音声があればその終了で、無ければ duration で進む。
  useEffect(() => {
    if (!playing) return;
    const audioUrl = timeline[index]?.audioAssetUrl;
    const audioEl = audioRef.current;

    if (audioUrl && audioEl) {
      audioEl.src = audioUrl;
      audioEl.currentTime = 0;
      const onEnded = () => advance();
      audioEl.addEventListener("ended", onEnded);
      void audioEl.play().catch(() => {});
      return () => {
        audioEl.removeEventListener("ended", onEnded);
        audioEl.pause();
      };
    }

    const dur = timeline[index]?.durationSec ?? 4;
    const id = setTimeout(advance, dur * 1000);
    return () => clearTimeout(id);
  }, [playing, index, timeline, advance]);

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

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} hidden />

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
