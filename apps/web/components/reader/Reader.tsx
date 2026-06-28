"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Work } from "@novel-theater/types";
import { Stage } from "@/components/stage/Stage";

/**
 * サイドバイサイド・リーダー（§3.2）。
 * 左に本文（シーン単位）、右にビジュアルステージ。スクロールに追従して現在シーンが切り替わる。
 */
export function Reader({ work }: { work: Work }) {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLDivElement | null>>([]);

  const blocks = useMemo(
    () =>
      work.scenes.map((s) => ({
        scene: s,
        text: work.sourceText.slice(s.sourceStart, s.sourceEnd),
      })),
    [work],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // 最も上にある可視ブロックを現在シーンとする。
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const top = visible[0];
        if (top) {
          const idx = Number((top.target as HTMLElement).dataset.index);
          if (!Number.isNaN(idx)) setActive(idx);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0.01 },
    );
    for (const el of refs.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [blocks.length]);

  return (
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
      <Stage scene={work.scenes[active] ?? null} />
    </div>
  );
}
