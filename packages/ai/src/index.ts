// LLM
export { ClaudeLLM } from "./llm/claude";
export type { LLMClient, LLMCompleteParams, LLMResult } from "./llm/types";

// シーン分割
export { HeuristicSegmenter } from "./segment/heuristic";
export { ClaudeSegmenter } from "./segment/claude";
export { SCENE_SEGMENT_SCHEMA } from "./segment/schema";
export { segmentFullText, type FullTextOptions } from "./segment/fulltext";

// プロンプト構築
export { TemplatePromptBuilder } from "./prompt/template";
export { ClaudePromptBuilder } from "./prompt/claude";

// 画像生成
export { DummyImageProvider, FalImageProvider, createImageProvider } from "./image";

// コスト
export { computeLLMCostUSD, type TokenUsage } from "./cost";

// パイプライン
export {
  generateWork,
  type PipelineDeps,
  type GenerateOptions,
  type GenerateResult,
  type GenerateMetrics,
  type StepTiming,
} from "./pipeline";

// 組み立て
export {
  createAiCapabilities,
  createPipelineDeps,
  type AiCapabilities,
} from "./factory";

// サービス（Phase 1: キュー＋永続化を束ねるオーケストレーション）
export {
  GenerationService,
  STYLE_PRESETS,
  type GenerationServiceDeps,
  type PlanOptions,
  type PlanResult,
} from "./service";
