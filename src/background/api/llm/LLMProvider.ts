// LLM プロバイダ抽象。本文 → SceneAnalysis を返す。
import type { SceneAnalysis } from '@/shared/types';
import type { AnalysisPromptInput } from '@/shared/prompts/sceneAnalysis';

export interface AnalyzeInput {
  prompt: AnalysisPromptInput;
  signal?: AbortSignal;
}

export interface LLMProvider {
  readonly id: 'claude' | 'gemini';
  analyze(input: AnalyzeInput): Promise<SceneAnalysis>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}
