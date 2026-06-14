// LLM 出力・設定の実行時検証 (Zod)。LLM の出力は untrusted として必ず検証する。
import { z } from 'zod';

export const characterRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  appearance: z.string().min(1),
  seedTag: z.string().optional(),
});

export const panelDialogueSchema = z.object({
  speakerId: z.string().optional(),
  text: z.string(),
});

export const panelSchema = z.object({
  index: z.number().int().nonnegative(),
  caption: z.string().optional(),
  dialogue: z.array(panelDialogueSchema).optional(),
  characterRefs: z.array(z.string()).default([]),
  sceneDescription: z.string().min(1),
  imagePrompt: z.string().min(1),
  styleHints: z.string().default(''),
  sourceParagraphs: z.tuple([z.number().int(), z.number().int()]).optional(),
});

export const sceneAnalysisSchema = z.object({
  styleGuide: z.string().min(1),
  characters: z.array(characterRefSchema).default([]),
  panels: z.array(panelSchema).min(1),
});

export type SceneAnalysisParsed = z.infer<typeof sceneAnalysisSchema>;

// ---- 設定スキーマ ----

export const settingsSchema = z.object({
  llm: z.object({
    provider: z.enum(['claude', 'gemini']),
    model: z.string(),
    apiKey: z.string(),
  }),
  image: z.object({
    provider: z.enum(['openai', 'imagen', 'stability']),
    model: z.string(),
    apiKey: z.string(),
    size: z.string(),
  }),
  panelCount: z.object({
    min: z.number().int().min(1),
    max: z.number().int().min(1),
  }),
  styleDefault: z.string(),
  storageScope: z.enum(['local', 'session']),
  ttsEnabled: z.boolean().optional(),
});

/**
 * LLM 応答テキストから JSON を取り出して検証する。
 * ```json フェンスや前後の地の文に耐性を持たせる。
 */
export function parseSceneAnalysis(raw: string): SceneAnalysisParsed {
  const json = extractJsonObject(raw);
  return sceneAnalysisSchema.parse(json);
}

/** 文字列から最初の JSON オブジェクトを抽出する（コードフェンス対応）。 */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  // ```json ... ``` フェンスを剥がす
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('LLM 応答に JSON オブジェクトが見つかりませんでした');
  }
  return JSON.parse(body.slice(start, end + 1));
}
