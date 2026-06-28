import { MODEL_PRICING, type ModelId } from "@novel-theater/config";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/**
 * usage から USD コストを計算する（§7.11）。
 * キャッシュ読み出しは ~0.1x、書き込みは ~1.25x で見積もる。
 */
export function computeLLMCostUSD(model: ModelId, u: TokenUsage): number {
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  const inUSD = (u.inputTokens / 1e6) * p.inputPerMTok;
  const cacheReadUSD = (u.cacheReadTokens / 1e6) * p.inputPerMTok * 0.1;
  const cacheCreateUSD = (u.cacheCreationTokens / 1e6) * p.inputPerMTok * 1.25;
  const outUSD = (u.outputTokens / 1e6) * p.outputPerMTok;
  return inUSD + cacheReadUSD + cacheCreateUSD + outUSD;
}
