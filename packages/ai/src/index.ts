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

// 動画生成（Phase 2）
export { DummyVideoProvider, FalVideoProvider, createVideoProvider } from "./video";

// ハイライト選択 / タイムライン（Phase 2）
export { selectHighlightIndices, maxVideosForLevel, buildTimeline } from "./highlights";

// Story Bible / ナレーション / 整合チェック / 音声（Phase 3）
export {
  HeuristicBibleBuilder,
  ClaudeBibleBuilder,
  type BibleBuilder,
  type BuiltBible,
} from "./bible";
export {
  HeuristicNarrationWriter,
  ClaudeNarrationWriter,
  type NarrationWriter,
} from "./narration";
export {
  NoopConsistencyChecker,
  ClaudeVisionChecker,
  type ConsistencyChecker,
  type ConsistencyResult,
} from "./consistency";
export { DummyVoiceProvider, ElevenLabsVoiceProvider, createVoiceProvider } from "./voice";

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
