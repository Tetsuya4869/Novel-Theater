import type { ModelId } from "@novel-theater/config";
import type { TokenUsage } from "../cost";

export interface LLMCompleteParams {
  /** 安定プレフィックスとしてキャッシュされるシステムプロンプト。 */
  system?: string;
  /** ユーザーメッセージ本文。 */
  user: string;
  /** 構造化出力の JSON Schema（指定時は output_config.format に渡す）。 */
  schema?: Record<string, unknown>;
  model?: ModelId;
  /** "low" | "medium" | "high" | "xhigh" | "max" */
  effort?: string;
  maxTokens?: number;
}

export interface LLMResult {
  text: string;
  /** schema 指定時にパース済みの JSON（失敗時 undefined）。 */
  json?: unknown;
  /** stop_reason === "refusal" のとき true（§7.10）。 */
  refusal: boolean;
  usage: TokenUsage;
  costUSD: number;
  latencyMs: number;
  model: ModelId;
}

/** テキスト推論クライアントの抽象（Claude 実装は claude.ts）。 */
export interface LLMClient {
  readonly model: ModelId;
  complete(params: LLMCompleteParams): Promise<LLMResult>;
}
