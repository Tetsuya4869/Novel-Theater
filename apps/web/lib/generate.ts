import { join } from "node:path";
import { loadEnv } from "@novel-theater/config";
import { LocalStorage } from "@novel-theater/storage";
import { createPipelineDeps, generateWork, type GenerateResult } from "@novel-theater/ai";

/**
 * サーバー側のみで動く生成入口（API キーはクライアントに渡さない §3.5）。
 * 生成画像は Next の public/generated に保存し、/generated/... で静的配信する。
 */
export async function runGeneration(
  text: string,
  title: string | undefined,
  style: string | undefined,
): Promise<GenerateResult> {
  const env = loadEnv();
  const storage = new LocalStorage({
    baseDir: join(process.cwd(), "public", "generated"),
    publicBaseUrl: "/generated",
  });
  const deps = createPipelineDeps(env, storage);
  return generateWork(
    text,
    { title, style, maxScenes: 3, maxImages: 3, costLimitUSD: env.NT_COST_LIMIT_USD },
    deps,
  );
}

export function maxInputChars(): number {
  return loadEnv().NT_MAX_INPUT_CHARS;
}
