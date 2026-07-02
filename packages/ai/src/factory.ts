import { hasLLM, MODELS, type Env } from "@novel-theater/config";
import type { PromptBuilder, SceneSegmenter } from "@novel-theater/types";
import type { WorkRepository } from "@novel-theater/db";
import type { JobQueue } from "@novel-theater/queue";
import { ClaudeLLM } from "./llm/claude";
import type { LLMClient } from "./llm/types";
import { ClaudeSegmenter } from "./segment/claude";
import { HeuristicSegmenter } from "./segment/heuristic";
import { ClaudePromptBuilder } from "./prompt/claude";
import { TemplatePromptBuilder } from "./prompt/template";
import { createImageProvider } from "./image";
import { createVideoProvider } from "./video";
import { createVoiceProvider } from "./voice";
import type { PipelineDeps } from "./pipeline";
import type { GenerationServiceDeps } from "./service";
import type { Storage } from "@novel-theater/storage";
import { ClaudeBibleBuilder, HeuristicBibleBuilder, type BibleBuilder } from "./bible";
import { ClaudeNarrationWriter, HeuristicNarrationWriter, type NarrationWriter } from "./narration";
import {
  ClaudeVisionChecker,
  NoopConsistencyChecker,
  type ConsistencyChecker,
} from "./consistency";

export interface AiCapabilities {
  llm: LLMClient | null;
  segmenter: SceneSegmenter;
  promptBuilder: PromptBuilder;
  bibleBuilder: BibleBuilder;
  narrationWriter: NarrationWriter;
  consistencyChecker: ConsistencyChecker;
}

/**
 * env から AI 能力を組み立てる。API キーがあれば Claude、無ければヒューリスティックへ。
 * 上位（apps/web・scripts・worker）は抽象インターフェースしか知らない（§9）。
 * モデルルーティング: 難所=opus（既定）、量産=sonnet、整合判定=sonnet（§7.11）。
 */
export function createAiCapabilities(env: Env): AiCapabilities {
  if (hasLLM(env)) {
    const llm = new ClaudeLLM(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL);
    return {
      llm,
      segmenter: new ClaudeSegmenter(llm),
      promptBuilder: new ClaudePromptBuilder(llm),
      bibleBuilder: new ClaudeBibleBuilder(llm),
      narrationWriter: new ClaudeNarrationWriter(llm, MODELS.workhorse),
      consistencyChecker: env.NT_CONSISTENCY_CHECK
        ? new ClaudeVisionChecker(llm, MODELS.workhorse)
        : new NoopConsistencyChecker(),
    };
  }
  return {
    llm: null,
    segmenter: new HeuristicSegmenter(),
    promptBuilder: new TemplatePromptBuilder(),
    bibleBuilder: new HeuristicBibleBuilder(),
    narrationWriter: new HeuristicNarrationWriter(),
    consistencyChecker: new NoopConsistencyChecker(),
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

/**
 * GenerationService の依存一式を env + I/O（repo/queue/storage）から組む。
 * apps/web と apps/worker はこれを共有し、プロバイダ配線の二重管理・乖離を防ぐ（§9）。
 */
export function createGenerationServiceDeps(
  env: Env,
  io: { repo: WorkRepository; queue: JobQueue; storage: Storage },
): GenerationServiceDeps {
  const caps = createAiCapabilities(env);
  return {
    env,
    repo: io.repo,
    queue: io.queue,
    storage: io.storage,
    segmenter: caps.segmenter,
    promptBuilder: caps.promptBuilder,
    imageProvider: createImageProvider(env),
    videoProvider: createVideoProvider(env),
    bibleBuilder: caps.bibleBuilder,
    narrationWriter: caps.narrationWriter,
    consistencyChecker: caps.consistencyChecker,
    voiceProvider: createVoiceProvider(env),
  };
}
