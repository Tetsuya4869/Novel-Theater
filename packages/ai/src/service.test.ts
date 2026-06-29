import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryWorkRepository } from "@novel-theater/db";
import { InProcessJobQueue } from "@novel-theater/queue";
import { LocalStorage } from "@novel-theater/storage";
import type {
  ImageGenerateInput,
  ImageGenerateResult,
  ImageProvider,
} from "@novel-theater/types";
import { HeuristicSegmenter } from "./segment/heuristic";
import { TemplatePromptBuilder } from "./prompt/template";
import { DummyImageProvider } from "./image/dummy";
import { GenerationService, type GenerationServiceDeps } from "./service";

const ENV = {
  ANTHROPIC_MODEL: "claude-opus-4-8",
  IMAGE_PROVIDER: "dummy",
  NT_MAX_INPUT_CHARS: 20_000,
  NT_COST_LIMIT_USD: 1.0,
  STORAGE_DIR: ".storage",
} as unknown as GenerationServiceDeps["env"];

const TEXT = "夜の駅前。\n\nミナがカイに気づいて駆け寄った。\n\n二人は黙って歩き出した。\n\n雨が上がっていた。";

function makeService(overrides: Partial<GenerationServiceDeps> = {}) {
  const repo = new InMemoryWorkRepository();
  const queue = new InProcessJobQueue({ concurrency: 2 });
  const storage = new LocalStorage({
    baseDir: join(tmpdir(), `nt-svc-${Date.now()}-${Math.round(Math.random() * 1e6)}`),
    publicBaseUrl: "/generated",
  });
  const deps: GenerationServiceDeps = {
    env: ENV,
    repo,
    queue,
    storage,
    segmenter: new HeuristicSegmenter(),
    promptBuilder: new TemplatePromptBuilder(),
    imageProvider: new DummyImageProvider(),
    ...overrides,
  };
  return { service: new GenerationService(deps), repo, queue, deps };
}

describe("GenerationService.plan", () => {
  it("全文を分割し、全シーンを captioned で永続化する", async () => {
    const { service, repo } = makeService();
    const { workId, cached, scenes } = await service.plan(TEXT, { prefetchCount: 0 });
    expect(cached).toBe(false);
    expect(scenes).toBe(4);
    const stored = await repo.get(workId);
    expect(stored?.work.scenes.every((s) => ["captioned", "image_generating", "image_ready"].includes(s.status))).toBe(true);
  });

  it("同一テキスト再投入はキャッシュヒットする", async () => {
    const { service } = makeService();
    const first = await service.plan(TEXT, { prefetchCount: 0 });
    const second = await service.plan(TEXT, { prefetchCount: 0 });
    expect(second.cached).toBe(true);
    expect(second.workId).toBe(first.workId);
  });
});

describe("GenerationService async generation", () => {
  it("先読みしたシーンがキュー経由でコマ絵を得る", async () => {
    const { service, repo, queue } = makeService();
    const { workId } = await service.plan(TEXT, { prefetchCount: 4 });
    await queue.onIdle();
    const stored = await repo.get(workId);
    const ready = stored!.work.scenes.filter((s) => s.status === "image_ready");
    expect(ready.length).toBe(4);
    expect(ready[0]!.assets[0]!.storageUrl).toMatch(/^\/generated\//);
  });

  it("processPending で残りも生成できる", async () => {
    const { service, repo } = makeService();
    const { workId } = await service.plan(TEXT, { prefetchCount: 0 });
    await service.processPending(workId);
    const stored = await repo.get(workId);
    expect(stored!.work.scenes.every((s) => s.status === "image_ready")).toBe(true);
  });
});

describe("コスト上限", () => {
  it("上限に達すると以降のシーンを生成しない", async () => {
    // 1 枚 $0.6 を返すプロバイダ + 上限 $1.0 → 2 枚目で上限到達、3 枚目以降は placeholder。
    const pricey: ImageProvider = {
      id: "pricey",
      async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
        return {
          data: new TextEncoder().encode("x"),
          contentType: "image/svg+xml",
          cost: 0.6,
          latencyMs: 1,
          seed: input.seed ?? 0,
        };
      },
    };
    const { service, repo } = makeService({ imageProvider: pricey });
    const { workId } = await service.plan(TEXT, { prefetchCount: 0, costLimitUSD: 1.0 });
    await service.processPending(workId);
    const stored = await repo.get(workId);
    expect(stored!.capReached).toBe(true);
    const ready = stored!.work.scenes.filter((s) => s.status === "image_ready").length;
    expect(ready).toBeLessThanOrEqual(2);
    expect(stored!.costSpentUSD).toBeLessThanOrEqual(1.2 + 1e-9);
  });
});

describe("失敗の局所化", () => {
  it("1 シーンが失敗しても他シーンは完了する", async () => {
    let calls = 0;
    const flaky: ImageProvider = {
      id: "flaky",
      async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
        calls++;
        if (calls === 1) throw new Error("一時的な失敗");
        return {
          data: new TextEncoder().encode("ok"),
          contentType: "image/svg+xml",
          cost: 0,
          latencyMs: 1,
          seed: input.seed ?? 0,
        };
      },
    };
    const { service, repo } = makeService({ imageProvider: flaky });
    const { workId } = await service.plan(TEXT, { prefetchCount: 0 });
    await service.processPending(workId);
    const stored = await repo.get(workId);
    const failed = stored!.work.scenes.filter((s) => s.status === "failed").length;
    const ready = stored!.work.scenes.filter((s) => s.status === "image_ready").length;
    expect(failed).toBe(1);
    expect(ready).toBe(stored!.work.scenes.length - 1);
  });

  it("失敗シーンは再生成で復旧できる", async () => {
    let calls = 0;
    const flaky: ImageProvider = {
      id: "flaky2",
      async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
        calls++;
        if (calls === 1) throw new Error("初回だけ失敗");
        return {
          data: new TextEncoder().encode("ok"),
          contentType: "image/svg+xml",
          cost: 0,
          latencyMs: 1,
          seed: input.seed ?? 0,
        };
      },
    };
    const { service, repo } = makeService({ imageProvider: flaky });
    const { workId } = await service.plan(TEXT, { prefetchCount: 0 });
    await service.processPending(workId);
    let stored = await repo.get(workId);
    const failedScene = stored!.work.scenes.find((s) => s.status === "failed")!;
    expect(failedScene).toBeDefined();

    await service.regenerate(workId, failedScene.id);
    // regenerate はキュー経由。InProcessJobQueue の完了を待つ。
    await (makeServiceQueueIdle(service));
    stored = await repo.get(workId);
    expect(stored!.work.scenes.find((s) => s.id === failedScene.id)!.status).toBe("image_ready");
  });
});

// regenerate はサービス内部のキューを使う。テスト用にキューの idle を待つヘルパ。
async function makeServiceQueueIdle(service: GenerationService): Promise<void> {
  const queue = (service as unknown as { d: { queue: InProcessJobQueue } }).d.queue;
  await queue.onIdle();
}
