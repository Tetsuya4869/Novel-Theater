import type {
  AspectRatio,
  BuiltPrompt,
  PromptBuilder,
  SegmentedScene,
  StoryBible,
} from "@novel-theater/types";
import type { LLMClient } from "../llm/types";
import { TemplatePromptBuilder } from "./template";

const IMAGE_PROMPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    prompt: { type: "string", description: "被写体・構図・ライティングを含む画像生成プロンプト" },
    negative_prompt: { type: "string", description: "除外要素" },
    aspect_ratio: { type: "string", enum: ["16:9", "4:3", "1:1", "2:3"] },
  },
  required: ["prompt", "negative_prompt", "aspect_ratio"],
} as const;

const SYSTEM = `あなたはシーン記述と Story Bible から画像生成プロンプトを設計するアートディレクターです。
被写体・構図・ライティング・除外要素（ネガティブプロンプト）・アスペクト比を JSON で返します。
キャラクターの外見と画風はブレないよう、与えられた視覚タグを必ず反映してください。`;

/** Claude による画像プロンプト構築（§7.5）。失敗時はテンプレートにフォールバック。 */
export class ClaudePromptBuilder implements PromptBuilder {
  readonly id = "claude";
  private readonly fallback = new TemplatePromptBuilder();
  constructor(private readonly llm: LLMClient) {}

  async build(scene: SegmentedScene, style: string, bible?: StoryBible): Promise<BuiltPrompt> {
    const charLines = bible
      ? scene.charactersPresent
          .map((name) => bible.characters.find((c) => c.name === name))
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
          .map((c) => `- ${c.name}: ${c.visualTags.join(", ")}`)
          .join("\n")
      : "";

    const user = [
      `画風: ${style || "(未指定)"}`,
      `シーン要約: ${scene.summary}`,
      `主な動き: ${scene.keyAction}`,
      `場所/時間/天候: ${scene.setting.place} / ${scene.setting.timeOfDay} / ${scene.setting.weather}`,
      `ムード: ${scene.mood}`,
      `ショット: ${scene.shotSuggestion}`,
      charLines ? `登場キャラの視覚タグ:\n${charLines}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const res = await this.llm.complete({
        system: SYSTEM,
        user,
        schema: IMAGE_PROMPT_SCHEMA as unknown as Record<string, unknown>,
        effort: "low",
        maxTokens: 1_000,
      });
      if (res.refusal || !res.json) return this.fallback.build(scene, style, bible);
      const j = res.json as { prompt?: string; negative_prompt?: string; aspect_ratio?: string };
      if (!j.prompt) return this.fallback.build(scene, style, bible);
      return {
        prompt: j.prompt,
        negativePrompt: j.negative_prompt,
        aspectRatio: (j.aspect_ratio as AspectRatio) ?? "4:3",
      };
    } catch {
      return this.fallback.build(scene, style, bible);
    }
  }
}
