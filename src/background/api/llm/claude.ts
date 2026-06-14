// Claude (Anthropic Messages API) を使った LLM プロバイダ。
import type { LLMProvider, AnalyzeInput } from './LLMProvider';
import { LLMError } from './LLMProvider';
import { analyzeWithRepair } from './analyzeShared';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

export interface ClaudeConfig {
  apiKey: string;
  model: string;
}

export function createClaudeProvider(cfg: ClaudeConfig): LLMProvider {
  const complete = async (system: string, user: string, signal?: AbortSignal) => {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        // 拡張からのブラウザ直叩きを許可する。
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 8192,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new LLMError(`Claude API エラー (${res.status}): ${body.slice(0, 300)}`, res.status);
    }
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (json.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
    if (!text) throw new LLMError('Claude API が空応答を返しました');
    return text;
  };

  return {
    id: 'claude',
    analyze: (input: AnalyzeInput) => analyzeWithRepair(complete, input.prompt, input.signal),
  };
}
