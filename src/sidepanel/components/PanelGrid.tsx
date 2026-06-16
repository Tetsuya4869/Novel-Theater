import { useEffect, useRef } from 'react';
import { PanelCard } from './PanelCard';
import { panelForParagraph, useStore } from '../store';
import { sendRpc } from '@/shared/messaging';
import type { Panel, PanelStatus } from '@/shared/types';

/** 段落をおおまかに数ブロックへまとめて表示する（解析前の暫定表示）。 */
function chunkParagraphs(paragraphs: string[], target = 8): string[] {
  if (paragraphs.length <= target) return paragraphs;
  const size = Math.ceil(paragraphs.length / target);
  const out: string[] = [];
  for (let i = 0; i < paragraphs.length; i += size) {
    out.push(paragraphs.slice(i, i + size).join('\n'));
  }
  return out;
}

export function PanelGrid() {
  const { chapter, analysis, job, images, visibleParagraph } = useStore();
  const activeIndex = panelForParagraph(analysis, visibleParagraph);
  const activeRef = useRef<HTMLDivElement>(null);

  // 読書位置に合わせてアクティブなコマを表示位置へスクロール。
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeIndex]);

  const regenerate = (index: number) => {
    if (!chapter) return;
    void sendRpc('regeneratePanel', { ref: chapter.ref, index });
  };

  const jump = (panel: Panel) => {
    if (panel.sourceParagraphs) {
      void sendRpc('scrollToParagraph', { paragraph: panel.sourceParagraphs[0] });
    }
  };

  if (analysis) {
    const statusOf = (index: number): PanelStatus =>
      job?.panels.find((p) => p.index === index)?.status ?? 'pending';
    const errorOf = (index: number) => job?.panels.find((p) => p.index === index)?.error;
    return (
      <div>
        {analysis.panels.map((p) => (
          <PanelCard
            key={p.index}
            ref={p.index === activeIndex ? activeRef : undefined}
            index={p.index}
            panel={p}
            imageUrl={images[p.index]}
            status={statusOf(p.index)}
            error={errorOf(p.index)}
            active={p.index === activeIndex}
            onRegenerate={regenerate}
            onJump={jump}
          />
        ))}
      </div>
    );
  }

  if (!chapter) return null;
  const blocks = chunkParagraphs(chapter.paragraphs);
  return (
    <div>
      <div className="phase">
        本文を抽出しました（{chapter.charCount} 文字）。
        {job?.phase === 'analyzing' && ' シーンを解析中…'}
      </div>
      {blocks.map((text, i) => (
        <PanelCard key={i} index={i} rawText={text} />
      ))}
    </div>
  );
}
