import { MODELS, type ModelId } from "@novel-theater/config";
import type { LLMClient } from "../llm/types";

export interface ConsistencyCharacter {
  name: string;
  appearance: string;
  visualTags: string[];
}

export interface ConsistencyInput {
  /** base64 画像データ。 */
  imageData: string;
  mediaType: string;
  sceneSummary: string;
  style: string;
  characters: ConsistencyCharacter[];
}

export interface ConsistencyResult {
  consistent: boolean;
  issues?: string;
  /** 不一致時の修正済み画像プロンプト案（再生成に使う）。 */
  suggestedPrompt?: string;
  costUSD: number;
}

/** 生成画像の整合チェック（§7.8）。Claude Vision / Noop の 2 実装。 */
export interface ConsistencyChecker {
  readonly id: string;
  check(input: ConsistencyInput): Promise<ConsistencyResult>;
}

/** オフライン/無効時は常に整合とみなす。 */
export class NoopConsistencyChecker implements ConsistencyChecker {
  readonly id = "noop";
  async check(): Promise<ConsistencyResult> {
    return { consistent: true, costUSD: 0 };
  }
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    consistent: { type: "boolean" },
    issues: { type: "string", description: "不一致の具体的な指摘（無ければ空文字）" },
    suggested_prompt: { type: "string", description: "修正済みの画像生成プロンプト（無ければ空文字）" },
  },
  required: ["consistent", "issues", "suggested_prompt"],
} as const;

const SYSTEM = `あなたは生成画像の品質検査官です。提示された画像が、シーン記述・キャラクターの外見・作品の画風と
整合しているかを判定します。不一致があれば具体的に指摘し、修正した画像生成プロンプトを提案してください。`;

/** Claude Vision による整合チェック。コスト効率のため既定は Sonnet（§7.11）。 */
export class ClaudeVisionChecker implements ConsistencyChecker {
  readonly id = "claude-vision";
  constructor(
    private readonly llm: LLMClient,
    private readonly model: ModelId = MODELS.workhorse,
  ) {}

  async check(input: ConsistencyInput): Promise<ConsistencyResult> {
    const chars = input.characters
      .map((c) => `- ${c.name}: ${c.appearance} [${c.visualTags.join(", ")}]`)
      .join("\n");
    const user = [
      `画風: ${input.style}`,
      `シーン: ${input.sceneSummary}`,
      chars ? `登場キャラの設定:\n${chars}` : "登場キャラ: （指定なし）",
      "この画像は上記と整合していますか？",
    ].join("\n");

    try {
      const res = await this.llm.complete({
        system: SYSTEM,
        user,
        images: [{ data: input.imageData, mediaType: input.mediaType }],
        schema: SCHEMA as unknown as Record<string, unknown>,
        model: this.model,
        effort: "low",
        maxTokens: 1_000,
      });
      if (res.refusal || !res.json) {
        return { consistent: true, costUSD: res.costUSD }; // 判定不能なら通す（過剰再生成を避ける）
      }
      const j = res.json as { consistent?: boolean; issues?: string; suggested_prompt?: string };
      return {
        consistent: j.consistent !== false,
        issues: j.issues || undefined,
        suggestedPrompt: j.suggested_prompt || undefined,
        costUSD: res.costUSD,
      };
    } catch {
      return { consistent: true, costUSD: 0 };
    }
  }
}
