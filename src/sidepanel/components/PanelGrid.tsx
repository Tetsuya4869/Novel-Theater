import { PanelCard } from './PanelCard';
import { useStore } from '../store';

/** 段落をおおまかに数ブロックへまとめて表示する（M1 の暫定表示）。 */
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
  const { chapter, analysis, images } = useStore();

  if (analysis) {
    return (
      <div>
        {analysis.panels.map((p) => (
          <PanelCard key={p.index} index={p.index} panel={p} imageUrl={images[p.index]} />
        ))}
      </div>
    );
  }

  if (!chapter) return null;
  const blocks = chunkParagraphs(chapter.paragraphs);
  return (
    <div>
      <div className="phase">本文を抽出しました（{chapter.charCount} 文字）。コマ絵化は次のフェーズで生成されます。</div>
      {blocks.map((text, i) => (
        <PanelCard key={i} index={i} rawText={text} />
      ))}
    </div>
  );
}
