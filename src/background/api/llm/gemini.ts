// Gemini (Google Generative Language API) を使った LLM プロバイダ。
import type { LLMProvider, AnalyzeInput } from './LLMProvider';
import { LLMError } from './LLMProvider';
import { analyzeWithRepair } from './analyzeShared';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export function createGeminiProvider(cfg: GeminiConfig): LLMProvider {
  const complete = async (system: string, user: string, signal?: AbortSignal) => {
    const url = `${BASE}/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new LLMError(`Gemini API エラー (${res.status}): ${body.slice(0, 300)}`, res.status);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('');
    if (!text) throw new LLMError('Gemini API が空応答を返しました');
    return text;
  };

  return {
    id: 'gemini',
    analyze: (input: AnalyzeInput) => analyzeWithRepair(complete, input.prompt, input.signal),
  };
}
