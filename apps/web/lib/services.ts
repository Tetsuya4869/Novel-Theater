import { join } from "node:path";
import { loadEnv } from "@novel-theater/config";
import { FileWorkRepository } from "@novel-theater/db";
import { InProcessJobQueue } from "@novel-theater/queue";
import { LocalStorage } from "@novel-theater/storage";
import { GenerationService, createGenerationServiceDeps } from "@novel-theater/ai";

/**
 * サーバー側シングルトン（API キーはクライアントへ渡さない §3.5）。
 * Phase 1: ファイル永続（.data/works）＋ インプロセス・ワーカープール。
 * 本番は Postgres + Redis/BullMQ + S3 互換へ差し替える（interface は同一）。
 * HMR を跨いで保持するため globalThis に置く。
 */
const g = globalThis as unknown as { __ntService?: GenerationService };

function build(): GenerationService {
  const env = loadEnv();
  const cwd = process.cwd();
  const storage = new LocalStorage({
    baseDir: join(cwd, "public", "generated"),
    publicBaseUrl: "/generated",
  });
  const repo = new FileWorkRepository(join(cwd, ".data", "works"));
  const queue = new InProcessJobQueue({ concurrency: 3 });
  // web と worker で配線を共有（乖離防止）。
  return new GenerationService(createGenerationServiceDeps(env, { repo, queue, storage }));
}

export function getService(): GenerationService {
  return (g.__ntService ??= build());
}

export function maxInputChars(): number {
  return loadEnv().NT_MAX_INPUT_CHARS;
}
