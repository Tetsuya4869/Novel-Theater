import Anthropic from "@anthropic-ai/sdk";
import type { ModelId } from "@novel-theater/config";
import { computeLLMCostUSD, type TokenUsage } from "../cost";
import type { LLMClient, LLMCompleteParams, LLMResult } from "./types";

/**
 * Claude（Anthropic）クライアントのラッパ（§5.3 / 付録）。
 * - 既定 claude-opus-4-8、adaptive thinking、Structured Outputs、ストリーミング
 * - stop_reason === "refusal" を必ず確認してから content を読む
 * - システムプロンプトに cache_control を付与し再生成コストを削減
 * - Opus 4.8 では temperature / budget_tokens / プリフィルを使わない
 */
export class ClaudeLLM implements LLMClient {
  private readonly client: Anthropic;
  readonly model: ModelId;

  constructor(apiKey: string, model: ModelId) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(params: LLMCompleteParams): Promise<LLMResult> {
    const model = params.model ?? this.model;
    const started = Date.now();

    // Vision: 画像があればユーザーメッセージを content ブロック配列で組む。
    const userContent =
      params.images && params.images.length > 0
        ? [
            ...params.images.map((img) => ({
              type: "image",
              source: { type: "base64", media_type: img.mediaType, data: img.data },
            })),
            { type: "text", text: params.user },
          ]
        : params.user;

    // SDK のバージョン差を吸収するため request はゆるく組む。
    const request: Record<string, unknown> = {
      model,
      max_tokens: params.maxTokens ?? 8_000,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: userContent }],
    };
    if (params.system) {
      request.system = [
        { type: "text", text: params.system, cache_control: { type: "ephemeral" } },
      ];
    }
    const outputConfig: Record<string, unknown> = {};
    if (params.effort) outputConfig.effort = params.effort;
    if (params.schema) {
      outputConfig.format = { type: "json_schema", schema: params.schema };
    }
    if (Object.keys(outputConfig).length > 0) request.output_config = outputConfig;

    // 長い入出力でも HTTP タイムアウトを避けるためストリーミングで実行。
    const stream = this.client.messages.stream(request as never);
    const message = (await stream.finalMessage()) as never as RawMessage;
    const latencyMs = Date.now() - started;

    const usage = toUsage(message.usage);
    const costUSD = computeLLMCostUSD(model, usage);

    if (message.stop_reason === "refusal") {
      return { text: "", json: undefined, refusal: true, usage, costUSD, latencyMs, model };
    }

    const text = (message.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");

    let json: unknown;
    if (params.schema && text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }

    return { text, json, refusal: false, usage, costUSD, latencyMs, model };
  }
}

interface RawMessage {
  stop_reason?: string;
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

function toUsage(u: RawMessage["usage"]): TokenUsage {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: u?.cache_creation_input_tokens ?? 0,
  };
}
