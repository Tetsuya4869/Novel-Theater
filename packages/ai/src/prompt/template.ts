import type {
  BuiltPrompt,
  PromptBuilder,
  SegmentedScene,
  StoryBible,
} from "@novel-theater/types";

/**
 * LLM を使わないテンプレート式プロンプト生成（Phase 0 / オフライン）。
 * シーン記述と画風（+ Story Bible のキャラ視覚タグ）を連結する。
 * 一貫性レベル1: キャラ記述と画風を毎回連結する（§7.4）。
 */
export class TemplatePromptBuilder implements PromptBuilder {
  readonly id = "template";

  async build(scene: SegmentedScene, style: string, bible?: StoryBible): Promise<BuiltPrompt> {
    const parts: string[] = [];
    if (style) parts.push(style);
    if (scene.setting.place) parts.push(scene.setting.place);
    if (scene.setting.timeOfDay) parts.push(scene.setting.timeOfDay);
    if (scene.setting.weather) parts.push(scene.setting.weather);
    if (scene.keyAction) parts.push(scene.keyAction);
    else if (scene.summary) parts.push(scene.summary);
    if (scene.mood) parts.push(`mood: ${scene.mood}`);
    if (scene.shotSuggestion) parts.push(scene.shotSuggestion);

    // 登場キャラの視覚タグを注入して一貫性を補強する。
    if (bible) {
      for (const name of scene.charactersPresent) {
        const ch = bible.characters.find((c) => c.name === name);
        if (ch && ch.visualTags.length > 0) {
          parts.push(`${ch.name} (${ch.visualTags.join(", ")})`);
        }
      }
    }

    return {
      prompt: parts.filter(Boolean).join(", "),
      negativePrompt: "lowres, text, watermark, extra fingers, deformed",
      aspectRatio: "4:3",
    };
  }
}
