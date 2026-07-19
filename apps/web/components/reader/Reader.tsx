"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkView } from "@/lib/view";
import {
  animateScene,
  fetchWork,
  narrateScene,
  prefetchScenes,
  regenerateScene,
  setVisibility,
  updateCharacter,
  updateScenePrompt,
} from "@/lib/client";
import { Stage } from "@/components/stage/Stage";
import { ImmersivePlayer } from "@/components/stage/ImmersivePlayer";
import { CharacterEditor } from "@/components/composer/CharacterEditor";
import { WorkActions } from "@/components/reader/WorkActions";

const POLL_MS = 2000;
const MAX_TICKS = 150;
const PREFETCH_BEFORE = 1;
const PREFETCH_COUNT = 5;

/** 目次サムネ・支援技術向けのシーン状態名。 */
const TOC_STATUS: Record<string, string> = {
  pending: "待機中",
  captioned: "待機中",
  image_generating: "生成中",
  image_ready: "生成済み",
  video_generating: "動画生成中",
  video_ready: "動画あり",
  failed: "失敗",
  placeholder: "コスト上限",
};

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
  // 自動更新の世代。操作や「再開する」で進めるとポーリングの時間上限がリセットされる。
  const [pollEpoch, setPollEpoch] = useState(0);
  const [autoStopped, setAutoStopped] = useState(false);
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  const work = view.work;
  const canEdit = view.canEdit;

  // モバイルはシアター（観る）モードを既定にする（§3.2）。初回マウント時のみ判定。
  useEffect(() => {
    if (window.matchMedia("(max-width: 720px)").matches) setMode("watch");
  }, []);

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

  // 現在地周辺の先読み（所有者のみ。閲覧者は生成済みコマのみ表示）。
  useEffect(() => {
    if (!canEdit) return;
    const from = Math.max(0, active - PREFETCH_BEFORE);
    prefetchScenes(work.id, from, PREFETCH_COUNT).catch(() => {});
  }, [active, work.id, canEdit]);

  // 生成完了をポーリングで反映。時間上限に達したら黙って止めず、バナーから再開できる。
  useEffect(() => {
    setAutoStopped(false);
    let ticks = 0;
    const id = setInterval(async () => {
      ticks++;
      await refresh();
      if (ticks >= MAX_TICKS) {
        clearInterval(id);
        setAutoStopped(true);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, pollEpoch]);

  // シーン操作の実行中管理。連打による有料ジョブの多重投入を防ぎ、UI に処理中を示す。
  const pendingRef = useRef<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const runSceneAction = useCallback(
    async (sceneId: string, fn: () => Promise<unknown>) => {
      if (pendingRef.current.has(sceneId)) return; // 実行中は無視（二重投入防止）
      pendingRef.current.add(sceneId);
      setPendingIds(new Set(pendingRef.current));
      try {
        await fn();
      } catch {
        /* 一時的な失敗は次のポーリングで回復 */
      }
      await refresh();
      setPollEpoch((e) => e + 1); // 操作したら自動更新を再開/リセット
      // 生成中ステータスがポーリングに反映されるまで少し保持する。
      setTimeout(() => {
        pendingRef.current.delete(sceneId);
        setPendingIds(new Set(pendingRef.current));
      }, 1500);
    },
    [refresh],
  );

  const onRegenerate = useCallback(
    (sceneId: string) => runSceneAction(sceneId, () => regenerateScene(work.id, sceneId)),
    [work.id, runSceneAction],
  );

  const onAnimate = useCallback(
    (sceneId: string) => runSceneAction(sceneId, () => animateScene(work.id, sceneId)),
    [work.id, runSceneAction],
  );

  const onNarrate = useCallback(
    (sceneId: string) => runSceneAction(sceneId, () => narrateScene(work.id, sceneId)),
    [work.id, runSceneAction],
  );

  const onSavePrompt = useCallback(
    (sceneId: string, prompt: string) =>
      runSceneAction(sceneId, async () => {
        await updateScenePrompt(work.id, sceneId, prompt);
        await regenerateScene(work.id, sceneId);
      }),
    [work.id, runSceneAction],
  );

  const onUpdateCharacter = useCallback(
    async (characterId: string, patch: { appearance?: string; visualTags?: string[] }) => {
      try {
        await updateCharacter(work.id, characterId, patch);
        await refresh();
      } catch {
        /* noop */
      }
    },
    [work.id, refresh],
  );

  const onChangeVisibility = useCallback(
    async (visibility: "private" | "unlisted" | "public") => {
      // 楽観更新してからサーバーへ反映。
      setView((v) => ({ ...v, work: { ...v.work, visibility } }));
      try {
        await setVisibility(work.id, visibility);
      } catch {
        await refresh();
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
            title={`#${i + 1} ${sc.summary}（${TOC_STATUS[sc.status] ?? sc.status}）`}
            aria-label={`シーン${i + 1}: ${TOC_STATUS[sc.status] ?? sc.status}`}
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
        {s.failed > 0 && (
          <>
            {" ・ "}
            <button
              className="linklike"
              onClick={() => {
                const idx = work.scenes.findIndex((sc) => sc.status === "failed");
                if (idx >= 0) {
                  setActive(idx);
                  if (mode === "read") scrollTo(idx);
                }
              }}
            >
              失敗 {s.failed}（最初の失敗へ移動）
            </button>
          </>
        )}
        {" ・ "}コスト ${s.costSpentUSD.toFixed(4)} / ${s.capUSD.toFixed(2)}
      </p>

      {autoStopped && (
        <p className="notice" style={{ marginBottom: "1rem" }}>
          長時間経過したため自動更新を一時停止しました。
          <button
            className="btn btn--ghost btn--sm"
            style={{ marginLeft: "0.6rem" }}
            onClick={() => setPollEpoch((e) => e + 1)}
          >
            再開する
          </button>
        </p>
      )}

      {s.capReached && (
        <p className="error" style={{ marginBottom: "1rem" }}>
          コスト上限（${s.capUSD.toFixed(2)}）に達しました。未生成のシーンはプレースホルダ表示です。
        </p>
      )}

      <WorkActions
        workId={work.id}
        visibility={work.visibility}
        canEdit={canEdit}
        likeCount={view.likeCount}
        onChangeVisibility={onChangeVisibility}
      />

      {canEdit && view.bible && view.bible.characters.length > 0 && (
        <CharacterEditor bible={view.bible} onSave={onUpdateCharacter} />
      )}

      {mode === "watch" ? (
        <ImmersivePlayer view={view} onAnimate={canEdit ? onAnimate : undefined} />
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
            pending={pendingIds.has(work.scenes[active]?.id ?? "")}
            onRegenerate={canEdit ? onRegenerate : undefined}
            onAnimate={canEdit ? onAnimate : undefined}
            onNarrate={canEdit ? onNarrate : undefined}
            onSavePrompt={canEdit ? onSavePrompt : undefined}
          />
        </div>
      )}
    </div>
  );
}
