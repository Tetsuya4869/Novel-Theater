"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkView } from "@/lib/view";
import {
  animateScene,
  fetchWork,
  narrateScene,
  prefetchScenes,
  regenerateScene,
  updateCharacter,
  updateScenePrompt,
} from "@/lib/client";
import { Stage } from "@/components/stage/Stage";
import { ImmersivePlayer } from "@/components/stage/ImmersivePlayer";
import { CharacterEditor } from "@/components/composer/CharacterEditor";

const POLL_MS = 2000;
const MAX_TICKS = 150;
const PREFETCH_BEFORE = 1;
const PREFETCH_COUNT = 5;

type Mode = "read" | "watch";

/**
 * 読める劇場（Phase 1）＋ シアターモード（Phase 2）。
 * - read: スクロール同期のサイドバイサイド（§3.2）
 * - watch: 自動進行の没入再生（§3.7）。モードはユーザー設定で切替。
 */
export function Reader({ initial }: { initial: WorkView }) {
  const [view, setView] = useState<WorkView>(initial);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>("read");
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  const work = view.work;

  const blocks = useMemo(
    () =>
      work.scenes.map((s) => ({
        scene: s,
        text: work.sourceText.slice(s.sourceStart, s.sourceEnd),
      })),
    [work],
  );

  const refresh = useCallback(async () => {
    try {
      setView(await fetchWork(work.id));
    } catch {
      /* 一時的なエラーは次のティックで再試行 */
    }
  }, [work.id]);

  // スクロール同期（read モードのみ）。
  useEffect(() => {
    if (mode !== "read") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const top = visible[0];
        if (top) {
          const idx = Number((top.target as HTMLElement).dataset.index);
          if (!Number.isNaN(idx)) setActive(idx);
        }
      },
      { rootMargin: "-15% 0px -60% 0px", threshold: 0.01 },
    );
    for (const el of refs.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [blocks.length, mode]);

  // 現在地周辺の先読み。
  useEffect(() => {
    const from = Math.max(0, active - PREFETCH_BEFORE);
    prefetchScenes(work.id, from, PREFETCH_COUNT).catch(() => {});
  }, [active, work.id]);

  // 生成完了をポーリングで反映。
  useEffect(() => {
    let ticks = 0;
    const id = setInterval(async () => {
      ticks++;
      await refresh();
      if (ticks > MAX_TICKS) clearInterval(id);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const onRegenerate = useCallback(
    async (sceneId: string) => {
      try {
        await regenerateScene(work.id, sceneId);
        setTimeout(refresh, 300);
      } catch {
        /* noop */
      }
    },
    [work.id, refresh],
  );

  const onAnimate = useCallback(
    async (sceneId: string) => {
      try {
        await animateScene(work.id, sceneId);
        setTimeout(refresh, 300);
      } catch {
        /* noop */
      }
    },
    [work.id, refresh],
  );

  const onNarrate = useCallback(
    async (sceneId: string) => {
      try {
        await narrateScene(work.id, sceneId);
        setTimeout(refresh, 300);
      } catch {
        /* noop */
      }
    },
    [work.id, refresh],
  );

  const onSavePrompt = useCallback(
    async (sceneId: string, prompt: string) => {
      try {
        await updateScenePrompt(work.id, sceneId, prompt);
        await regenerateScene(work.id, sceneId);
        setTimeout(refresh, 300);
      } catch {
        /* noop */
      }
    },
    [work.id, refresh],
  );

  const onUpdateCharacter = useCallback(
    async (characterId: string, patch: { appearance?: string; visualTags?: string[] }) => {
      try {
        await updateCharacter(work.id, characterId, patch);
        setTimeout(refresh, 300);
      } catch {
        /* noop */
      }
    },
    [work.id, refresh],
  );

  const scrollTo = (i: number) => refs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });

  const s = view.status;

  return (
    <div>
      <div className="modebar">
        <button
          className={`btn btn--sm ${mode === "read" ? "" : "btn--ghost"}`}
          onClick={() => setMode("read")}
        >
          📖 読む（同期）
        </button>
        <button
          className={`btn btn--sm ${mode === "watch" ? "" : "btn--ghost"}`}
          onClick={() => setMode("watch")}
        >
          🎬 観る（自動再生）
        </button>
      </div>

      <div className="toc" role="navigation" aria-label="シーン目次">
        {work.scenes.map((sc, i) => (
          <button
            key={sc.id}
            className={`toc__cell toc__cell--${sc.status}`}
            data-active={i === active}
            title={`#${i} ${sc.summary} (${sc.status})`}
            onClick={() => {
              setActive(i);
              if (mode === "read") scrollTo(i);
            }}
          />
        ))}
      </div>
      <p className="muted" style={{ fontSize: "0.85rem", margin: "0.4rem 0 1rem" }}>
        コマ絵 {s.ready}/{s.total} 生成済み
        {s.videoReady > 0 && ` ・ 動画 ${s.videoReady}`}
        {s.generating > 0 && ` ・ 生成中 ${s.generating}`}
        {s.failed > 0 && ` ・ 失敗 ${s.failed}`}
        {" ・ "}コスト ${s.costSpentUSD.toFixed(4)} / ${s.capUSD.toFixed(2)}
      </p>

      {s.capReached && (
        <p className="error" style={{ marginBottom: "1rem" }}>
          コスト上限（${s.capUSD.toFixed(2)}）に達しました。未生成のシーンはプレースホルダ表示です。
        </p>
      )}

      {view.bible && view.bible.characters.length > 0 && (
        <CharacterEditor bible={view.bible} onSave={onUpdateCharacter} />
      )}

      {mode === "watch" ? (
        <ImmersivePlayer view={view} onAnimate={onAnimate} />
      ) : (
        <div className="reader">
          <div className="reader__text">
            {blocks.map(({ scene, text }, i) => (
              <div
                key={scene.id}
                data-index={i}
                data-active={i === active}
                className="scene-block"
                ref={(el) => {
                  refs.current[i] = el;
                }}
              >
                {text.split("\n").map((line, j) => (
                  <p key={j} style={{ margin: "0 0 0.5rem" }}>
                    {line}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <Stage
            scene={work.scenes[active] ?? null}
            onRegenerate={onRegenerate}
            onAnimate={onAnimate}
            onNarrate={onNarrate}
            onSavePrompt={onSavePrompt}
          />
        </div>
      )}
    </div>
  );
}
