"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkView } from "@/lib/view";
import { fetchWork, prefetchScenes, regenerateScene } from "@/lib/client";
import { Stage } from "@/components/stage/Stage";

const POLL_MS = 2000;
const MAX_TICKS = 150;
const PREFETCH_BEFORE = 1;
const PREFETCH_COUNT = 5;

/**
 * 読める劇場（Phase 1）。
 * - スクロール追従で現在シーンを切替（§3.2）
 * - 現在地周辺を先読み（§3.3）し、ポーリングで生成完了を反映（プレースホルダ→差し替え）
 * - 目次サムネで各シーンの状態を可視化、個別再生成（§3.3）
 */
export function Reader({ initial }: { initial: WorkView }) {
  const [view, setView] = useState<WorkView>(initial);
  const [active, setActive] = useState(0);
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
      /* 一時的なエラーは無視（次のティックで再試行）。 */
    }
  }, [work.id]);

  // スクロール同期。
  useEffect(() => {
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
  }, [blocks.length]);

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

  const scrollTo = (i: number) => refs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });

  const s = view.status;

  return (
    <div>
      <div className="toc" role="navigation" aria-label="シーン目次">
        {work.scenes.map((sc, i) => (
          <button
            key={sc.id}
            className={`toc__cell toc__cell--${sc.status}`}
            data-active={i === active}
            title={`#${i} ${sc.summary} (${sc.status})`}
            onClick={() => scrollTo(i)}
          />
        ))}
      </div>
      <p className="muted" style={{ fontSize: "0.85rem", margin: "0.4rem 0 1rem" }}>
        コマ絵 {s.ready}/{s.total} 生成済み
        {s.generating > 0 && ` ・ 生成中 ${s.generating}`}
        {s.failed > 0 && ` ・ 失敗 ${s.failed}`}
        {" ・ "}コスト ${s.costSpentUSD.toFixed(4)} / ${s.capUSD.toFixed(2)}
      </p>

      {s.capReached && (
        <p className="error" style={{ marginBottom: "1rem" }}>
          コスト上限（${s.capUSD.toFixed(2)}）に達しました。未生成のシーンはプレースホルダ表示です。
        </p>
      )}

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
        <Stage scene={work.scenes[active] ?? null} onRegenerate={onRegenerate} />
      </div>
    </div>
  );
}
