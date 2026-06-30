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
import { DummyVideoProvider } from "./video/dummy";
import { DummyVoiceProvider } from "./voice";
import { HeuristicBibleBuilder, type BibleBuilder } from "./bible";
import { HeuristicNarrationWriter } from "./narration";
import { NoopConsistencyChecker, type ConsistencyChecker } from "./consistency";
import { buildTimeline, selectHighlightIndices } from "./highlights";
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
    videoProvider: new DummyVideoProvider(),
    bibleBuilder: new HeuristicBibleBuilder(),
    narrationWriter: new HeuristicNarrationWriter(),
    consistencyChecker: new NoopConsistencyChecker(),
    voiceProvider: new DummyVoiceProvider(),
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

describe("動画化 (Phase 2)", () => {
  it("animateScene でハイライトが動画化される（画像が無ければ先に生成）", async () => {
    const { service, repo, queue } = makeService();
    const { workId } = await service.plan(TEXT, { prefetchCount: 0 });
    const stored0 = await repo.get(workId);
    const sceneId = stored0!.work.scenes[1]!.id;

    await service.animateScene(workId, sceneId);
    await queue.onIdle();

    const stored = await repo.get(workId);
    const scene = stored!.work.scenes.find((s) => s.id === sceneId)!;
    expect(scene.status).toBe("video_ready");
    expect(scene.assets.some((a) => a.kind === "video" && a.status === "ready")).toBe(true);
    // 静止画フォールバック用に画像アセットも残っている。
    expect(scene.assets.some((a) => a.kind === "image")).toBe(true);
  });

  it("先読み(enqueueScenes)は video_ready シーンを再生成して動画を壊さない", async () => {
    const { service, repo, queue } = makeService();
    const { workId } = await service.plan(TEXT, { prefetchCount: 0 });
    const sceneId = (await repo.get(workId))!.work.scenes[0]!.id;
    await service.animateScene(workId, sceneId);
    await queue.onIdle();
    expect((await repo.get(workId))!.work.scenes[0]!.status).toBe("video_ready");

    // 当該シーンが先読み範囲に入っても動画は維持される（再生成で消えない）。
    await service.enqueueScenes(workId, [0]);
    await queue.onIdle();
    const scene = (await repo.get(workId))!.work.scenes[0]!;
    expect(scene.status).toBe("video_ready");
    expect(scene.assets.some((a) => a.kind === "video" && a.status === "ready")).toBe(true);
  });

  it("動画生成失敗時は静止画へフォールバックする", async () => {
    const failingVideo = {
      id: "failvid",
      async animate() {
        throw new Error("i2v 失敗");
      },
    };
    const { service, repo, queue } = makeService({ videoProvider: failingVideo });
    const { workId } = await service.plan(TEXT, { prefetchCount: 0 });
    const sceneId = (await repo.get(workId))!.work.scenes[0]!.id;

    await service.animateScene(workId, sceneId);
    await queue.onIdle();

    const scene = (await repo.get(workId))!.work.scenes.find((s) => s.id === sceneId)!;
    expect(scene.status).toBe("image_ready"); // フォールバック
    expect(scene.assets.some((a) => a.kind === "image" && a.status === "ready")).toBe(true);
    expect(scene.assets.some((a) => a.kind === "video")).toBe(false);
  });

  it("videoLevel=highlight で投入時にハイライトが自動動画化される", async () => {
    // video_candidate はヒューリスティックで本文長 > 200 のシーンに付く。長文を用意する。
    const long = [0, 1, 2].map(() => "あ".repeat(250)).join("\n\n");
    const { service, repo, queue } = makeService();
    const { workId } = await service.plan(long, { prefetchCount: 0, videoLevel: "highlight" });
    await queue.onIdle();
    const stored = await repo.get(workId);
    const videoReady = stored!.work.scenes.filter((s) => s.status === "video_ready").length;
    expect(videoReady).toBeGreaterThan(0);
    expect(videoReady).toBeLessThanOrEqual(2); // highlight 上限
  });

  it("コスト上限を超えると動画化しない", async () => {
    const priceyVideo = {
      id: "priceyvid",
      async animate() {
        return { data: new TextEncoder().encode("v"), contentType: "video/mp4", cost: 5, latencyMs: 1 };
      },
    };
    const { service, repo, queue } = makeService({ videoProvider: priceyVideo });
    const { workId } = await service.plan(TEXT, { prefetchCount: 4, costLimitUSD: 1.0 });
    await queue.onIdle();
    // 画像生成（dummy, $0）→ 上限未満 → 1本目の動画で $5 → 上限到達 → 以降は動画化されない。
    const sceneIds = (await repo.get(workId))!.work.scenes.map((s) => s.id);
    for (const id of sceneIds) await service.animateScene(workId, id);
    await queue.onIdle();
    const stored = await repo.get(workId);
    const videoReady = stored!.work.scenes.filter((s) => s.status === "video_ready").length;
    expect(stored!.capReached).toBe(true);
    // 上限が機能し、全シーンの動画化は止まる（並列度 2 のため最大 2 本まではゲートを通過しうる）。
    expect(videoReady).toBeLessThanOrEqual(2);
    expect(videoReady).toBeLessThan(stored!.work.scenes.length);
  });
});

describe("buildTimeline", () => {
  it("startSec は累積し、duration は 3〜10 秒に収まる", async () => {
    const { service, repo } = makeService();
    const { workId } = await service.plan(TEXT, { prefetchCount: 0 });
    const work = (await repo.get(workId))!.work;
    const tl = buildTimeline(work);
    expect(tl.length).toBe(work.scenes.length);
    let prev = 0;
    for (const item of tl) {
      expect(item.startSec).toBeGreaterThanOrEqual(prev);
      expect(item.durationSec).toBeGreaterThanOrEqual(3);
      expect(item.durationSec).toBeLessThanOrEqual(10);
      prev = item.startSec;
    }
  });
});

describe("selectHighlightIndices", () => {
  it("video_candidate を panel_priority 降順で max 件選ぶ", () => {
    const scenes = [
      { orderIndex: 0, panelPriority: 1, videoCandidate: false },
      { orderIndex: 1, panelPriority: 5, videoCandidate: true },
      { orderIndex: 2, panelPriority: 3, videoCandidate: true },
      { orderIndex: 3, panelPriority: 4, videoCandidate: true },
    ];
    expect(selectHighlightIndices(scenes, 2)).toEqual([1, 3]);
    expect(selectHighlightIndices(scenes, 0)).toEqual([]);
  });
});

// Phase 3 ---------------------------------------------------------------------

// 登場キャラを返すスタブ Bible ビルダー（参照画像注入の検証用）。
const bibleWithCharacters: BibleBuilder = {
  id: "stub",
  async build() {
    return {
      artStyle: { name: "manga", description: "manga ink" },
      worldSetting: {},
      characters: [{ name: "カイ", appearance: { description: "黒髪・長身" }, visualTags: ["black hair"] }],
    };
  },
};

describe("Story Bible / 一貫性 (Phase 3)", () => {
  it("buildBible がキャラの参照画像を生成し referenceImageUrl を設定する", async () => {
    const { service, repo, queue } = makeService({ bibleBuilder: bibleWithCharacters });
    const { workId } = await service.plan(TEXT, { prefetchCount: 0, buildBible: true });
    await queue.onIdle(); // Bible 構築はジョブ化されている
    const stored = await repo.get(workId);
    expect(stored!.bible).toBeDefined();
    expect(stored!.bible!.characters.length).toBe(1);
    expect(stored!.bible!.characters[0]!.referenceImageUrl).toMatch(/\/bible\//);
  });

  it("updateCharacter で設定編集＆参照画像を再生成できる", async () => {
    const { service, repo, queue } = makeService({ bibleBuilder: bibleWithCharacters });
    const { workId } = await service.plan(TEXT, { prefetchCount: 0 });
    await queue.onIdle(); // Bible 構築はジョブ化されている
    const charId = (await repo.get(workId))!.bible!.characters[0]!.id;
    const ok = await service.updateCharacter(workId, charId, { visualTags: ["white hair"] });
    expect(ok).toBe(true);
    const ch = (await repo.get(workId))!.bible!.characters[0]!;
    expect(ch.visualTags).toEqual(["white hair"]);
    expect(ch.referenceImageUrl).toMatch(/\/bible\//);
  });

  it("整合チェック NG は再生成され、最終的に整合する（リトライ上限内）", async () => {
    let checks = 0;
    const checker: ConsistencyChecker = {
      id: "stub-vision",
      async check() {
        checks++;
        // 1 回目 NG（プロンプト修正案つき）、2 回目 OK。
        return checks === 1
          ? { consistent: false, suggestedPrompt: "fixed prompt", costUSD: 0 }
          : { consistent: true, costUSD: 0 };
      },
    };
    // panel_priority>=4 を得るため長文（>=480字）の 1 段落を使う。
    const long = "あ".repeat(520);
    const { service, repo } = makeService({ consistencyChecker: checker });
    const { workId } = await service.plan(long, { prefetchCount: 0 });
    await service.processPending(workId);
    expect(checks).toBe(2); // 2 回チェック = 1 回再生成
    const scene = (await repo.get(workId))!.work.scenes[0]!;
    expect(scene.status).toBe("image_ready");
  });
});

describe("ナレーション (Phase 3)", () => {
  it("narrateScene が音声アセットを生成し、タイムラインに audioAssetUrl が載る", async () => {
    const { service, repo, queue } = makeService();
    const { workId } = await service.plan(TEXT, { prefetchCount: 0 });
    const sceneId = (await repo.get(workId))!.work.scenes[0]!.id;
    await service.narrateScene(workId, sceneId);
    await queue.onIdle();
    const stored = await repo.get(workId);
    const scene = stored!.work.scenes.find((s) => s.id === sceneId)!;
    const audio = scene.assets.find((a) => a.kind === "audio");
    expect(audio?.storageUrl).toMatch(/-audio\.wav$/);

    const tl = buildTimeline(stored!.work);
    expect(tl[0]!.audioAssetUrl).toBe(audio!.storageUrl);
    expect(tl[0]!.durationSec).toBeGreaterThan(0);
  });

  it("plan(narration:true) で先読み範囲のナレーションが生成される", async () => {
    const { service, repo, queue } = makeService();
    const { workId } = await service.plan(TEXT, { prefetchCount: 2, narration: true });
    await queue.onIdle();
    const stored = await repo.get(workId);
    const withAudio = stored!.work.scenes.filter((s) => s.assets.some((a) => a.kind === "audio")).length;
    expect(withAudio).toBeGreaterThan(0);
  });
});

describe("プロンプト手動編集 (Phase 3)", () => {
  it("updateScenePrompt でロックし、再生成時に手動プロンプトが使われる", async () => {
    const { service, repo, queue } = makeService();
    const { workId } = await service.plan(TEXT, { prefetchCount: 0 });
    const scene0 = (await repo.get(workId))!.work.scenes[0]!;
    await service.updateScenePrompt(workId, scene0.id, "MANUAL PROMPT XYZ");
    await service.regenerate(workId, scene0.id);
    await queue.onIdle();
    const after = (await repo.get(workId))!.work.scenes[0]!;
    expect(after.promptLocked).toBe(true);
    expect(after.imagePrompt).toBe("MANUAL PROMPT XYZ");
    expect(after.status).toBe("image_ready");
  });
});
