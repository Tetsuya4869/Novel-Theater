import { z } from "zod";

/**
 * モデル ID と料金（§5.3 / §7.11）。
 * 役割でモデルを使い分ける: 難所=opus, 量産=sonnet, 雑務=haiku。
 */
export const MODELS = {
  /** 長編一括解析・高品質なシーン設計・Story Bible 構築・難所 */
  reasoning: "claude-opus-4-8",
  /** 量産的なシーン分割・プロンプト生成（コスト効率重視の本番主力） */
  workhorse: "claude-sonnet-4-6",
  /** 軽量タスク（alt テキスト・短い分類・動画化向き判定） */
  light: "claude-haiku-4-5",
} as const;

/** $/1M tokens。実値はプロバイダ確定後に docs/eval.md で更新する。 */
export const MODEL_PRICING = {
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
} as const;

export type ModelId = keyof typeof MODEL_PRICING;

export function isModelId(value: string): value is ModelId {
  return value in MODEL_PRICING;
}

/**
 * 環境変数スキーマ。Phase 0 では実値が無くても動作するよう、外部依存はすべて任意。
 */
const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z
    .string()
    .refine(isModelId, "未知のモデル ID です")
    .default(MODELS.reasoning),

  IMAGE_PROVIDER: z.enum(["dummy", "fal", "replicate"]).default("dummy"),
  VIDEO_PROVIDER: z.enum(["dummy", "fal"]).default("dummy"),
  FAL_KEY: z.string().min(1).optional(),
  REPLICATE_API_TOKEN: z.string().min(1).optional(),

  NT_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(20_000),
  NT_COST_LIMIT_USD: z.coerce.number().positive().default(1.0),

  STORAGE_DIR: z.string().default(".storage"),

  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * process.env を検証して型付き設定を返す。`reasoning`/`workhorse`/`light` は
 * 役割名であり、ANTHROPIC_MODEL は reasoning の上書きにのみ用いる。
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`環境変数の検証に失敗しました:\n${issues}`);
  }
  return parsed.data;
}

/** API キーの有無で「Claude が使えるか」を判定する。 */
export function hasLLM(env: Env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}
