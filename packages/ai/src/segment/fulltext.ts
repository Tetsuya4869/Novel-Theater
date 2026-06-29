import { splitIntoParagraphs } from "@novel-theater/core";
import type { SceneSegmenter, SegmentedScene } from "@novel-theater/types";

export interface FullTextOptions {
  /** チャンク 1 つあたりの最大文字数（§7.2 章チャンク相当）。 */
  chunkChars?: number;
  language?: string;
}

/**
 * 全文をシーン分割する（Phase 1）。長文は段落境界でチャンク化して分割し、
 * 各チャンクのオフセットを絶対位置へ補正する。Claude 経路ではチャンク単位に
 * システムプロンプトがキャッシュされコストを抑えられる。
 */
export async function segmentFullText(
  segmenter: SceneSegmenter,
  text: string,
  opts: FullTextOptions = {},
): Promise<SegmentedScene[]> {
  const chunkChars = opts.chunkChars ?? 4_000;

  if (text.length <= chunkChars) {
    const part = await segmenter.segment(text, { language: opts.language });
    return part.map((s, i) => ({ ...s, index: i }));
  }

  const chunks = chunkByParagraph(text, chunkChars);
  const all: SegmentedScene[] = [];
  let idx = 0;
  for (const c of chunks) {
    const part = await segmenter.segment(c.text, { language: opts.language });
    for (const s of part) {
      all.push({
        ...s,
        index: idx++,
        sourceStart: s.sourceStart + c.start,
        sourceEnd: s.sourceEnd + c.start,
      });
    }
  }
  return all;
}

interface Chunk {
  start: number;
  text: string;
}

/** 段落境界を保ったまま、chunkChars 以下のチャンクへ貪欲にまとめる。 */
function chunkByParagraph(text: string, chunkChars: number): Chunk[] {
  const spans = splitIntoParagraphs(text);
  if (spans.length === 0) return [{ start: 0, text }];

  const chunks: Chunk[] = [];
  let chunkStart = spans[0]!.start;
  let chunkEnd = spans[0]!.end;

  for (let i = 1; i < spans.length; i++) {
    const span = spans[i]!;
    const wouldBe = span.end - chunkStart;
    if (wouldBe > chunkChars && chunkEnd > chunkStart) {
      chunks.push({ start: chunkStart, text: text.slice(chunkStart, chunkEnd) });
      chunkStart = span.start;
    }
    chunkEnd = span.end;
  }
  chunks.push({ start: chunkStart, text: text.slice(chunkStart, chunkEnd) });
  return chunks;
}
