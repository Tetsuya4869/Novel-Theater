import type { ArtStyle, Character, Work } from "@novel-theater/types";
import type { LLMClient } from "../llm/types";

/** 構築された Story Bible（character の id はサービス側で採番）。 */
export interface BuiltBible {
  artStyle: ArtStyle;
  worldSetting: Record<string, unknown>;
  characters: Array<Omit<Character, "id">>;
}

/** Story Bible 構築器（§7.4）。Claude / ヒューリスティックの 2 実装。 */
export interface BibleBuilder {
  readonly id: string;
  build(work: Work): Promise<BuiltBible>;
}

/** LLM を使わない簡易構築。画風は設定から、キャラはシーンの登場人物名を集約。 */
export class HeuristicBibleBuilder implements BibleBuilder {
  readonly id = "heuristic";

  async build(work: Work): Promise<BuiltBible> {
    const names = new Set<string>();
    for (const s of work.scenes) {
      for (const n of s.directingNotes.characters ?? []) {
        const trimmed = n.trim();
        if (trimmed) names.add(trimmed);
      }
    }
    const characters = [...names].map((name) => ({
      name,
      appearance: {},
      visualTags: [],
    }));
    return {
      artStyle: { name: work.settings.style, description: work.settings.style },
      worldSetting: {},
      characters,
    };
  }
}

const BIBLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    art_style: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        palette: { type: "string" },
        era: { type: "string" },
      },
      required: ["name", "description", "palette", "era"],
    },
    world_setting: {
      type: "object",
      additionalProperties: false,
      properties: { summary: { type: "string" } },
      required: ["summary"],
    },
    characters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          appearance: { type: "string", description: "髪・目・体格・服装・象徴的特徴" },
          visual_tags: { type: "array", items: { type: "string" } },
        },
        required: ["name", "appearance", "visual_tags"],
      },
    },
  },
  required: ["art_style", "world_setting", "characters"],
} as const;

const SYSTEM = `あなたは作品全体の一貫性のために Story Bible を作る編集者です。
本文を読み、再登場するキャラクター（名前・外見・一意な視覚タグ）と作品全体の画風・世界観を抽出します。
外見は髪/目/体格/服装/象徴的特徴を簡潔に。視覚タグは画像生成に効く短い英語キーワードを推奨。`;

/** Claude による Story Bible 自動抽出（§7.4）。失敗時はヒューリスティックへフォールバック。 */
export class ClaudeBibleBuilder implements BibleBuilder {
  readonly id = "claude";
  private readonly fallback = new HeuristicBibleBuilder();
  constructor(private readonly llm: LLMClient) {}

  async build(work: Work): Promise<BuiltBible> {
    // コスト抑制のため冒頭〜一定量を読ませる（長編は章チャンクの先頭を代表に）。
    const excerpt = work.sourceText.slice(0, 8_000);
    try {
      const res = await this.llm.complete({
        system: SYSTEM,
        user: `画風プリセット: ${work.settings.style}\n\n本文:\n---\n${excerpt}\n---`,
        schema: BIBLE_SCHEMA as unknown as Record<string, unknown>,
        effort: "medium",
        maxTokens: 4_000,
      });
      if (res.refusal || !res.json) return this.fallback.build(work);
      const j = res.json as RawBible;
      return {
        artStyle: {
          name: j.art_style?.name ?? work.settings.style,
          description: j.art_style?.description ?? work.settings.style,
          palette: j.art_style?.palette,
          era: j.art_style?.era,
        },
        worldSetting: { summary: j.world_setting?.summary ?? "" },
        characters: (j.characters ?? []).map((c) => ({
          name: c.name,
          appearance: { description: c.appearance },
          visualTags: c.visual_tags ?? [],
        })),
      };
    } catch {
      return this.fallback.build(work);
    }
  }
}

interface RawBible {
  art_style?: { name?: string; description?: string; palette?: string; era?: string };
  world_setting?: { summary?: string };
  characters?: Array<{ name: string; appearance?: string; visual_tags?: string[] }>;
}
