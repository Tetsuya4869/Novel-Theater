// LLM 共通: プロンプト構築 → 呼び出し → Zod 検証 → 失敗時 1 回だけ修復。
import type { SceneAnalysis } from '@/shared/types';
import { parseSceneAnalysis } from '@/shared/schema';
import {
  buildSystemPrompt,
  buildUserPrompt,
  type AnalysisPromptInput,
} from '@/shared/prompts/sceneAnalysis';
import { LLMError } from './LLMProvider';

/** プロバイダ固有の生テキスト補完関数。 */
export type CompleteFn = (
  system: string,
  user: string,
  signal?: AbortSignal,
) => Promise<string>;

export async function analyzeWithRepair(
  complete: CompleteFn,
  prompt: AnalysisPromptInput,
  signal?: AbortSignal,
): Promise<SceneAnalysis> {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(prompt);

  const first = await complete(system, user, signal);
  try {
    return parseSceneAnalysis(first);
  } catch (e) {
    // 修復: スキーマ違反を伝えて JSON のみ再出力させる。
    const repairUser = [
      '前回の出力は指定スキーマに適合しませんでした。',
      `エラー: ${(e as Error).message}`,
      '同じ内容を、有効な JSON オブジェクトのみで再出力してください。説明文は不要です。',
      '--- 前回の出力 ---',
      first,
    ].join('\n');
    const second = await complete(system, repairUser, signal);
    try {
      return parseSceneAnalysis(second);
    } catch (e2) {
      throw new LLMError('LLM 出力の検証に失敗しました: ' + (e2 as Error).message);
    }
  }
}
