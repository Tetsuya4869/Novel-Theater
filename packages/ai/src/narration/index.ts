import { MODELS, type ModelId } from "@novel-theater/config";
import type { LLMClient } from "../llm/types";

export interface NarrationInput {
  sceneText: string;
  summary: string;
  language?: string;
}
export interface NarrationScript {
  script: string;
  voiceId: string;
}

/** ナレーション台本生成（§7.7）。Claude / ヒューリスティックの 2 実装。 */
export interface NarrationWriter {
  readonly id: string;
  write(input: NarrationInput): Promise<NarrationScript>;
}

/** LLM 無し: 本文をそのまま朗読台本にする（空白整形のみ）。 */
export class HeuristicNarrationWriter implements NarrationWriter {
  readonly id = "heuristic";
  async write(input: NarrationInput): Promise<NarrationScript> {
    const script = input.sceneText.replace(/\s+/g, " ").trim() || input.summary;
    return { script, voiceId: "default" };
  }
}

const SYSTEM = `あなたは朗読台本のライターです。与えられたシーン本文を、聞いて自然な朗読向けテキストに整えます。
地の文はそのまま、セリフは自然な区切りで。説明や注釈は加えず、読み上げる文章だけを返します。`;

/** Claude による朗読台本生成。量産タスクのため既定は Sonnet（モデルルーティング §7.11）。 */
export class ClaudeNarrationWriter implements NarrationWriter {
  readonly id = "claude";
  private readonly fallback = new HeuristicNarrationWriter();
  constructor(
    private readonly llm: LLMClient,
    private readonly model: ModelId = MODELS.workhorse,
  ) {}

  async write(input: NarrationInput): Promise<NarrationScript> {
    try {
      const res = await this.llm.complete({
        system: SYSTEM,
        user: input.sceneText,
        model: this.model,
        effort: "low",
        maxTokens: 1_500,
      });
      if (res.refusal || !res.text.trim()) return this.fallback.write(input);
      return { script: res.text.trim(), voiceId: "default" };
    } catch {
      return this.fallback.write(input);
    }
  }
}
