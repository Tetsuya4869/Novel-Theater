import { splitIntoParagraphs } from "@novel-theater/core";
import type { SceneSegmenter, SegmentedScene, SegmentOptions } from "@novel-theater/types";

/**
 * LLM を使わないヒューリスティックなシーン分割。
 * API キーが無い環境（Phase 0 のオフライン動作・スパイク）で品質を「動く形」で検証する。
 * オフセットは正規化後テキストに正確に対応する（スクロール同期の前提を満たす）。
 */
export class HeuristicSegmenter implements SceneSegmenter {
  readonly id = "heuristic";

  async segment(text: string, opts?: SegmentOptions): Promise<SegmentedScene[]> {
    const maxScenes = opts?.maxScenes ?? Infinity;
    let spans = splitIntoParagraphs(text);
    if (spans.length === 0 && text.trim().length > 0) {
      spans = [{ start: 0, end: text.length, text }];
    }
    // 上限を超える場合は、隣接段落をまとめて指定数に収める。
    if (spans.length > maxScenes && maxScenes !== Infinity) {
      spans = mergeSpans(spans, maxScenes);
    }

    return spans.map((s, i) => {
      const len = s.end - s.start;
      return {
        index: i,
        sourceStart: s.start,
        sourceEnd: s.end,
        summary: firstSentence(s.text, 40),
        setting: { place: "", timeOfDay: "", weather: "" },
        charactersPresent: [],
        keyAction: firstSentence(s.text, 60),
        mood: "",
        shotSuggestion: "medium shot",
        panelPriority: clamp(Math.round(len / 120), 1, 5),
        videoCandidate: len > 200,
      } satisfies SegmentedScene;
    });
  }
}

/** spans を「ちょうど target 個」の連続グループへ、サイズが均等になるように束ねる。 */
function mergeSpans(
  spans: ReturnType<typeof splitIntoParagraphs>,
  target: number,
): ReturnType<typeof splitIntoParagraphs> {
  const n = spans.length;
  const base = Math.floor(n / target);
  const remainder = n % target; // 先頭 remainder 個のグループだけ +1 する
  const out: ReturnType<typeof splitIntoParagraphs> = [];
  let i = 0;
  for (let g = 0; g < target; g++) {
    const size = base + (g < remainder ? 1 : 0);
    if (size === 0) continue;
    const group = spans.slice(i, i + size);
    i += size;
    const first = group[0]!;
    const last = group[group.length - 1]!;
    out.push({ start: first.start, end: last.end, text: group.map((g2) => g2.text).join("\n\n") });
  }
  return out;
}

function firstSentence(text: string, max: number): string {
  const m = text.match(/^[^。.!?！？\n]*[。.!?！？]?/);
  const head = (m?.[0] ?? text).trim();
  return head.length > max ? head.slice(0, max) + "…" : head;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
