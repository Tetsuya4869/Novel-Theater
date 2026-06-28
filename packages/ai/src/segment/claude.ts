import type { SceneSegmenter, SegmentedScene, SegmentOptions } from "@novel-theater/types";
import type { LLMClient } from "../llm/types";
import { SCENE_SEGMENT_SCHEMA } from "./schema";

const SYSTEM = `あなたは小説を「絵にする単位（ビート）」へ分割する編集者です。
場面転換・視点変化・時間経過を手がかりに、視覚的に意味のある転換点でのみ分割します。
1 シーン = 1 枚に割りすぎるとコストが爆発するため、過剰に分割しないこと。
各シーンには、与えられた本文に対する文字オフセット範囲 (source_start, source_end) を必ず付与します。
オフセットは 0 始まり、source_start < source_end、シーンは本文順（昇順）に並べます。`;

/**
 * Claude による高品質なシーン分割（§7.2）。
 * LLM はオフセットを誤りうるため、返り値をこちら側で検証・クランプして堅牢化する（R8 対策）。
 */
export class ClaudeSegmenter implements SceneSegmenter {
  readonly id = "claude";
  constructor(private readonly llm: LLMClient) {}

  async segment(text: string, opts?: SegmentOptions): Promise<SegmentedScene[]> {
    const maxScenes = opts?.maxScenes;
    const user = [
      maxScenes ? `最大 ${maxScenes} シーンに分割してください。` : "適切な数に分割してください。",
      "本文（正規化済み、オフセットはこの文字列の先頭からの位置）:",
      "---",
      text,
      "---",
    ].join("\n");

    const result = await this.llm.complete({
      system: SYSTEM,
      user,
      schema: SCENE_SEGMENT_SCHEMA as unknown as Record<string, unknown>,
      effort: "medium",
      maxTokens: 8_000,
    });

    if (result.refusal || !result.json) {
      throw new Error("シーン分割に失敗しました（refusal または JSON パース不可）");
    }

    const raw = (result.json as { scenes?: unknown }).scenes;
    if (!Array.isArray(raw)) throw new Error("シーン分割の出力形式が不正です");

    const scenes = raw.map((r, i) => normalizeScene(r as RawScene, i, text.length));
    return clampOffsets(scenes, text.length);
  }
}

interface RawScene {
  index?: number;
  source_start?: number;
  source_end?: number;
  summary?: string;
  setting?: { place?: string; time_of_day?: string; weather?: string };
  characters_present?: string[];
  key_action?: string;
  mood?: string;
  shot_suggestion?: string;
  panel_priority?: number;
  video_candidate?: boolean;
}

function normalizeScene(r: RawScene, i: number, len: number): SegmentedScene {
  return {
    index: i,
    sourceStart: clampInt(r.source_start ?? 0, 0, len),
    sourceEnd: clampInt(r.source_end ?? len, 0, len),
    summary: r.summary ?? "",
    setting: {
      place: r.setting?.place ?? "",
      timeOfDay: r.setting?.time_of_day ?? "",
      weather: r.setting?.weather ?? "",
    },
    charactersPresent: r.characters_present ?? [],
    keyAction: r.key_action ?? "",
    mood: r.mood ?? "",
    shotSuggestion: r.shot_suggestion ?? "medium shot",
    panelPriority: clampInt(r.panel_priority ?? 3, 1, 5),
    videoCandidate: Boolean(r.video_candidate),
  };
}

/** オフセットの単調性・範囲を保証する。破綻していれば均等割りにフォールバック。 */
function clampOffsets(scenes: SegmentedScene[], len: number): SegmentedScene[] {
  const valid = scenes.every(
    (s, i) =>
      s.sourceStart < s.sourceEnd &&
      s.sourceEnd <= len &&
      (i === 0 || s.sourceStart >= scenes[i - 1]!.sourceStart),
  );
  if (valid && scenes.length > 0) return scenes;

  const n = Math.max(scenes.length, 1);
  const step = Math.ceil(len / n);
  return scenes.map((s, i) => ({
    ...s,
    sourceStart: Math.min(i * step, len),
    sourceEnd: Math.min((i + 1) * step, len),
  }));
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}
