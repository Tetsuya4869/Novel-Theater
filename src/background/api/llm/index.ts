// 設定から LLM プロバイダを生成するファクトリ。
import type { Settings } from '@/shared/types';
import type { LLMProvider } from './LLMProvider';
import { createClaudeProvider } from './claude';
import { createGeminiProvider } from './gemini';

export function createLLMProvider(s: Settings): LLMProvider {
  const { provider, model, apiKey } = s.llm;
  if (!apiKey) throw new Error('LLM の API キーが未設定です。設定画面で入力してください。');
  switch (provider) {
    case 'claude':
      return createClaudeProvider({ apiKey, model });
    case 'gemini':
      return createGeminiProvider({ apiKey, model });
    default:
      throw new Error(`未知の LLM プロバイダ: ${provider}`);
  }
}

export type { LLMProvider };
