import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { loadEnv } from "@novel-theater/config";
import { FileWorkRepository, type StoredWork } from "@novel-theater/db";
import { InProcessJobQueue } from "@novel-theater/queue";
import { LocalStorage } from "@novel-theater/storage";
import { GenerationService, createGenerationServiceDeps } from "@novel-theater/ai";

/**
 * 独立ワーカー（Phase 4 §10 DoD「ワーカーを増やして同時生成数を伸ばせる」）。
 *
 * web と同じ共有ストレージ（dev: ファイル / 本番: Postgres + S3 + Redis/BullMQ）を介して
 * 同一の GenerationService を駆動し、未生成シーンを消化する。複数プロセス／マシンで
 * 並走させると水平スケールする（本番は行ロック等で重複処理を防ぐ。dev のファイル版は
 * content_hash キャッシュで多重生成を緩和するのみ）。
 *
 * 既定では apps/web と同じディレクトリを共有する（リポジトリ root から実行する前提）。
 * `NT_WORKS_DIR` / `NT_GENERATED_DIR` で上書きできる。
 */
const WORKS_DIR = process.env.NT_WORKS_DIR ?? join(process.cwd(), "apps", "web", ".data", "works");
const GENERATED_DIR =
  process.env.NT_GENERATED_DIR ?? join(process.cwd(), "apps", "web", "public", "generated");
const POLL_MS = Number(process.env.NT_WORKER_POLL_MS ?? 3000);
const CONCURRENCY = Number(process.env.NT_WORKER_CONCURRENCY ?? 4);
const ONCE = process.argv.includes("--once");

/**
 * ワーカーが自動処理する未着手シーン数。failed は数えない
 * （決定論的に失敗するシーンで有料 API を無限に叩かないため。復旧は明示的な再生成で行う）。
 */
function pendingCount(stored: StoredWork): number {
  return stored.work.scenes.filter(
    (s) => s.status === "captioned" || s.status === "pending",
  ).length;
}

function buildService(): { service: GenerationService; repo: FileWorkRepository } {
  const env = loadEnv();
  const storage = new LocalStorage({ baseDir: GENERATED_DIR, publicBaseUrl: "/generated" });
  const repo = new FileWorkRepository(WORKS_DIR);
  const queue = new InProcessJobQueue({ concurrency: CONCURRENCY });
  // web と同一の配線を共有（プロバイダ差し替えの二重管理を避ける）。
  const service = new GenerationService(createGenerationServiceDeps(env, { repo, queue, storage }));
  return { service, repo };
}

/** 1 周回: 全作品を走査し、未生成シーンを持つものを処理する。処理したシーン概数を返す。 */
async function tick(service: GenerationService, repo: FileWorkRepository): Promise<number> {
  const all = await repo.listAll();
  let processed = 0;
  for (const stored of all) {
    const pending = pendingCount(stored);
    if (pending === 0) continue;
    await service.processPending(stored.work.id, { skipFailed: true });
    processed += pending;
  }
  return processed;
}

async function main(): Promise<void> {
  const { service, repo } = buildService();
  console.log(`[worker] works=${WORKS_DIR}`);
  console.log(`[worker] generated=${GENERATED_DIR} concurrency=${CONCURRENCY} once=${ONCE}`);

  if (ONCE) {
    const n = await tick(service, repo);
    console.log(`[worker] processed ~${n} pending scenes`);
    return;
  }

  // ポーリングループ（本番は Redis/BullMQ の購読に置き換える）。
  // eslint-disable-next-line no-constant-condition
  for (;;) {
    try {
      const n = await tick(service, repo);
      if (n > 0) console.log(`[worker] processed ~${n} pending scenes`);
    } catch (err) {
      console.error("[worker] tick error", err);
    }
    await sleep(POLL_MS);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
