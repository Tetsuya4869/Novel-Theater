/**
 * Phase 0 検証 CLI（PLAN.md §14）。
 *
 *   テキスト → シーン分割 → 画像プロンプト → コマ絵 1〜N 枚生成 → ストレージ保存
 *   → コスト / レイテンシ / 一貫性所感を標準出力に表示
 *
 * 三大リスク（品質・コスト・レイテンシ）を UI より先に数値で可視化する。
 *
 *   実行: pnpm spike [テキストファイル|"直接テキスト"]
 *   既定の入力は samples/ のパブリックドメイン作品。
 *   ANTHROPIC_API_KEY が無ければシーン分割はヒューリスティックにフォールバック（コスト 0）。
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadEnv, hasLLM } from "@novel-theater/config";
import { LocalStorage } from "@novel-theater/storage";
import { createPipelineDeps, generateWork } from "@novel-theater/ai";

const DEFAULT_SAMPLE = "samples/rashomon-excerpt.txt";

async function resolveInput(arg: string | undefined): Promise<{ source: string; text: string }> {
  if (!arg) {
    const path = resolve(DEFAULT_SAMPLE);
    return { source: DEFAULT_SAMPLE, text: await readFile(path, "utf8") };
  }
  if (existsSync(arg)) {
    return { source: arg, text: await readFile(resolve(arg), "utf8") };
  }
  return { source: "(inline)", text: arg };
}

function bar(label: string) {
  console.log(`\n[1m${label}[0m`);
}

async function main() {
  const env = loadEnv();
  const { source, text } = await resolveInput(process.argv[2]);

  bar("Novel-Theater · Phase 0 spike");
  console.log(`input          : ${source} (${text.length} chars)`);
  console.log(`LLM            : ${hasLLM(env) ? `Claude (${env.ANTHROPIC_MODEL})` : "heuristic (no API key)"}`);
  console.log(`image provider : ${env.IMAGE_PROVIDER}`);
  console.log(`cost limit     : $${env.NT_COST_LIMIT_USD.toFixed(2)}`);

  if (text.length > env.NT_MAX_INPUT_CHARS) {
    console.error(`\n入力が長すぎます（上限 ${env.NT_MAX_INPUT_CHARS} 文字）。Phase 0 では章単位に分割してください。`);
    process.exit(1);
  }

  const storageDir = join(env.STORAGE_DIR, "spike");
  const storage = new LocalStorage({ baseDir: storageDir, publicBaseUrl: storageDir });
  const deps = createPipelineDeps(env, storage);

  const { work, metrics } = await generateWork(
    text,
    {
      title: source,
      maxScenes: 3,
      maxImages: 3,
      costLimitUSD: env.NT_COST_LIMIT_USD,
    },
    deps,
  );

  bar("Scenes");
  for (const s of work.scenes) {
    console.log(
      `  #${s.orderIndex} [${s.sourceStart}-${s.sourceEnd}] ${badge(s.status)} ` +
        `prio=${s.panelPriority} video=${s.videoCandidate ? "Y" : "N"}`,
    );
    console.log(`     summary: ${s.summary}`);
    if (s.imagePrompt) console.log(`     prompt : ${truncate(s.imagePrompt, 100)}`);
    for (const a of s.assets) {
      console.log(`     asset  : ${a.storageUrl} (${a.providerId}, $${(a.cost ?? 0).toFixed(4)})`);
    }
  }

  bar("Step timings");
  for (const st of metrics.steps) {
    const cost = st.costUSD !== undefined ? ` $${st.costUSD.toFixed(4)}` : "";
    console.log(`  ${st.ms.toString().padStart(6)} ms  ${st.step}${cost}`);
  }

  bar("Summary (品質・コスト・レイテンシ)");
  console.log(`  scenes               : ${metrics.scenes}`);
  console.log(`  images generated     : ${metrics.imagesGenerated} (failed: ${metrics.imagesFailed})`);
  console.log(`  time-to-first-panel  : ${fmtMs(metrics.timeToFirstPanelMs)}  (TTFM 代理指標, 目標 ≤ 30s)`);
  console.log(`  total cost           : $${metrics.totalCostUSD.toFixed(4)}`);
  console.log(`  total latency        : ${fmtMs(metrics.totalMs)}`);
  console.log(`  stored under         : ${resolve(storageDir, work.id)}`);
  console.log("\n所見は docs/eval.md に記録すること（一貫性 PoC を含む）。");
}

function badge(status: string): string {
  return status === "image_ready"
    ? "[32m●[0m"
    : status === "failed"
      ? "[31m✗[0m"
      : "[33m○[0m";
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function fmtMs(ms: number | undefined): string {
  if (ms === undefined) return "n/a";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

main().catch((err) => {
  console.error("\nspike 失敗:", err);
  process.exit(1);
});
