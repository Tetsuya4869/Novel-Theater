import type { TimelineItem, Work } from "@novel-theater/types";

/**
 * 動画化するハイライトシーンを選ぶ（§7.6）。
 * video_candidate かつ panel_priority の高いシーンを優先し、max 件に絞る。
 * （Claude Haiku による補助判定は Phase 3 で追加。Phase 2 はヒューリスティック。）
 */
export function selectHighlightIndices(
  scenes: ReadonlyArray<{ orderIndex: number; panelPriority: number; videoCandidate: boolean }>,
  max: number,
): number[] {
  if (max <= 0) return [];
  return scenes
    .filter((s) => s.videoCandidate)
    .slice()
    .sort((a, b) => b.panelPriority - a.panelPriority || a.orderIndex - b.orderIndex)
    .slice(0, max)
    .map((s) => s.orderIndex)
    .sort((a, b) => a - b);
}

/** videoLevel から自動動画化の上限数を決める。 */
export function maxVideosForLevel(level: Work["settings"]["videoLevel"]): number {
  switch (level) {
    case "rich":
      return 5;
    case "highlight":
      return 2;
    default:
      return 0;
  }
}

/**
 * 再生タイムラインを組む（§8）。表示尺はナレーション音声があればその尺、無ければ本文量（3〜10 秒）。
 * audioAssetUrl をセットしてコマ／本文／音声の同期再生に使う（§7.7）。
 */
export function buildTimeline(work: Work): TimelineItem[] {
  let t = 0;
  const items: TimelineItem[] = [];
  for (const s of work.scenes) {
    const audio = s.assets.find((a) => a.kind === "audio" && a.status === "ready");
    const audioDur =
      audio && typeof (audio.meta as { durationSec?: number }).durationSec === "number"
        ? (audio.meta as { durationSec: number }).durationSec
        : undefined;
    const chars = s.sourceEnd - s.sourceStart;
    const dur = audioDur ?? Math.round(clamp(3 + chars / 40, 3, 10) * 10) / 10;
    items.push({
      sceneId: s.id,
      orderIndex: s.orderIndex,
      startSec: Math.round(t * 10) / 10,
      durationSec: Math.round(dur * 10) / 10,
      audioAssetUrl: audio?.storageUrl,
    });
    t += dur;
  }
  return items;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
