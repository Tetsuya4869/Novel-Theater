import { hasLLM, type Env } from "@novel-theater/config";
import type { PromptBuilder, SceneSegmenter } from "@novel-theater/types";
import { ClaudeLLM } from "./llm/claude";
import type { LLMClient } from "./llm/types";
import { ClaudeSegmenter } from "./segment/claude";
import { HeuristicSegmenter } from "./segment/heuristic";
import { ClaudePromptBuilder } from "./prompt/claude";
import { TemplatePromptBuilder } from "./prompt/template";
import { createImageProvider } from "./image";
import type { PipelineDeps } from "./pipeline";
import type { Storage } from "@novel-theater/storage";

export interface AiCapabilities {
  llm: LLMClient | null;
  segmenter: SceneSegmenter;
  promptBuilder: PromptBuilder;
}

/**
 * env から AI 能力を組み立てる。API キーがあれば Claude、無ければヒューリスティックへ。
 * 上位（apps/web・scripts・worker）は抽象インターフェースしか知らない（§9）。
 */
export function createAiCapabilities(env: Env): AiCapabilities {
  if (hasLLM(env)) {
    const llm = new ClaudeLLM(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL);
    return {
      llm,
      segmenter: new ClaudeSegmenter(llm),
      promptBuilder: new ClaudePromptBuilder(llm),
    };
  }
  return {
    llm: null,
    segmenter: new HeuristicSegmenter(),
    promptBuilder: new TemplatePromptBuilder(),
  };
}

/** env + ストレージから pipeline 用の依存一式を組む。 */
export function createPipelineDeps(env: Env, storage: Storage): PipelineDeps {
  const caps = createAiCapabilities(env);
  return {
    segmenter: caps.segmenter,
    promptBuilder: caps.promptBuilder,
    imageProvider: createImageProvider(env),
    storage,
  };
}
