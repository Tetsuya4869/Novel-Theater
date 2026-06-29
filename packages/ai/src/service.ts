import { randomUUID } from "node:crypto";
import { contentHash, normalizeText } from "@novel-theater/core";
import type { Env } from "@novel-theater/config";
import type { StoredWork, WorkRepository } from "@novel-theater/db";
import type { JobQueue } from "@novel-theater/queue";
import type { Storage } from "@novel-theater/storage";
import type {
  Asset,
  ImageProvider,
  PromptBuilder,
  Scene,
  SceneSegmenter,
  SegmentedScene,
  Work,
  WorkSettings,
} from "@novel-theater/types";
import { segmentFullText } from "./segment/fulltext";

/** アートスタイルのプリセット（§3.2 投入画面）。 */
export const STYLE_PRESETS: ReadonlyArray<{ id: string; label: string; prompt: string }> = [
  { id: "manga", label: "マンガ（白黒）", prompt: "manga panel, ink, monochrome, detailed line art, screentone" },
  { id: "anime", label: "アニメ調（カラー）", prompt: "anime style, vivid colors, cel shading, cinematic lighting" },
  { id: "watercolor", label: "水彩", prompt: "soft watercolor illustration, delicate washes, paper texture" },
  { id: "gekiga", label: "劇画", prompt: "gritty gekiga style, heavy ink, dramatic shadows, realistic" },
];

export interface GenerationServiceDeps {
  env: Env;
  repo: WorkRepository;
  queue: JobQueue;
  storage: Storage;
  segmenter: SceneSegmenter;
  promptBuilder: PromptBuilder;
  imageProvider: ImageProvider;
}

export interface PlanOptions {
  title?: string;
  style?: string;
  language?: string;
  /** 投入直後に先読み生成するシーン数。 */
  prefetchCount?: number;
  costLimitUSD?: number;
}

export interface PlanResult {
  workId: string;
  /** 同一テキスト再投入によるキャッシュヒットなら true（§8.3）。 */
  cached: boolean;
  scenes: number;
}

const DEFAULT_STYLE = STYLE_PRESETS[0]!.prompt;

/**
 * Phase 1 の中核オーケストレーション（apps/web と将来の apps/worker が共有）。
 * - plan: 全文をシーン分割して永続化し、現在地周辺のジョブを投入（API は workId を返す）
 * - enqueueScenes: 先読み（現在地周辺のみ生成、コスト上限内）
 * - regenerate: シーン個別の再生成
 * - processPending: 同期的に未生成シーンを処理（worker / バッチ / テスト用）
 */
export class GenerationService {
  private forceCounter = 0;

  constructor(private readonly d: GenerationServiceDeps) {}

  async plan(text: string, opts: PlanOptions = {}): Promise<PlanResult> {
    const normalized = normalizeText(text);
    const settings: WorkSettings = {
      style: opts.style ?? DEFAULT_STYLE,
      panelDensity: "medium",
      videoLevel: "none",
      narration: false,
    };
    const hash = contentHash([normalized, JSON.stringify(settings), "v1"]);

    const cachedWork = await this.d.repo.findByContentHash(hash);
    if (cachedWork) {
      return { workId: cachedWork.work.id, cached: true, scenes: cachedWork.work.scenes.length };
    }

    const workId = randomUUID();
    const segments = await segmentFullText(this.d.segmenter, normalized, {
      language: opts.language,
    });

    const scenes: Scene[] = segments.map((s) => segmentToScene(s, workId));
    const work: Work = {
      id: workId,
      title: opts.title ?? "無題",
      sourceText: normalized,
      language: opts.language ?? "ja",
      visibility: "private",
      contentHash: hash,
      settings,
      scenes,
    };
    const now = Date.now();
    const stored: StoredWork = {
      work,
      costSpentUSD: 0,
      capUSD: opts.costLimitUSD ?? this.d.env.NT_COST_LIMIT_USD,
      capReached: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.d.repo.save(stored);

    const prefetch = opts.prefetchCount ?? 4;
    await this.enqueueScenes(workId, range(0, Math.min(prefetch, scenes.length)));

    return { workId, cached: false, scenes: scenes.length };
  }

  /** 現在地周辺の先読み。eligible なシーンのみキューへ。戻り値は投入数。 */
  async enqueueScenes(
    workId: string,
    indices: number[],
    opts: { force?: boolean } = {},
  ): Promise<number> {
    const stored = await this.d.repo.get(workId);
    if (!stored) return 0;
    let enqueued = 0;
    for (const i of indices) {
      const scene = stored.work.scenes[i];
      if (!scene) continue;
      if (!opts.force && (scene.status === "image_ready" || scene.status === "image_generating")) {
        continue;
      }
      if (stored.capReached && !opts.force) continue;

      const jobId = opts.force
        ? `${workId}:${i}:r${Date.now()}:${this.forceCounter++}`
        : `${workId}:${i}`;
      if (!opts.force && this.d.queue.has(jobId)) continue;

      this.d.queue.add({
        id: jobId,
        priority: i,
        run: () => this.runSceneJob(workId, i, Boolean(opts.force)),
      });
      enqueued++;
    }
    return enqueued;
  }

  /** シーン個別の再生成（新しい seed で強制実行）。 */
  async regenerate(workId: string, sceneId: string): Promise<boolean> {
    const stored = await this.d.repo.get(workId);
    if (!stored) return false;
    const i = stored.work.scenes.findIndex((s) => s.id === sceneId);
    if (i < 0) return false;
    const n = await this.enqueueScenes(workId, [i], { force: true });
    return n > 0;
  }

  /** 未生成/失敗シーンを同期的に処理する（worker / バッチ / テスト用）。 */
  async processPending(workId: string, opts: { force?: boolean } = {}): Promise<void> {
    const stored = await this.d.repo.get(workId);
    if (!stored) return;
    for (let i = 0; i < stored.work.scenes.length; i++) {
      const scene = stored.work.scenes[i]!;
      if (!opts.force && scene.status === "image_ready") continue;
      // 失敗は当該シーンに閉じ込め、残りのシーンの処理を続行する（§7.10）。
      // runSceneJob 内で scene.status は failed に設定済み。
      try {
        await this.runSceneJob(workId, i, Boolean(opts.force));
      } catch {
        /* シーン単位の失敗は無視して継続 */
      }
    }
  }

  getStored(workId: string): Promise<StoredWork | undefined> {
    return this.d.repo.get(workId);
  }

  // -------------------------------------------------------------------------

  /** 1 シーン分の画像生成ジョブ。失敗は当該シーンに閉じ込め全体を止めない（§7.10）。 */
  private async runSceneJob(workId: string, index: number, force: boolean): Promise<void> {
    const stored = await this.d.repo.get(workId);
    if (!stored) return;
    const scene = stored.work.scenes[index];
    if (!scene) return;
    if (!force && scene.status === "image_ready") return;

    // コスト上限ガード（§7.11 / §11.2）。
    if (stored.costSpentUSD >= stored.capUSD) {
      stored.capReached = true;
      scene.status = "placeholder";
      await this.d.repo.save(stored);
      return;
    }

    scene.status = "image_generating";
    await this.d.repo.save(stored);

    try {
      const segment = sceneToSegmented(scene);
      const built = await this.d.promptBuilder.build(segment, stored.work.settings.style);
      scene.imagePrompt = built.prompt;
      scene.negativePrompt = built.negativePrompt;

      const seed = force
        ? (seedFromHash(stored.work.contentHash, index) + this.forceCounter++ * 101 + Date.now()) %
          2_147_483_647
        : seedFromHash(stored.work.contentHash, index);
      const promptHash = contentHash([built.prompt, seed, this.d.imageProvider.id]);

      // content_hash キャッシュ: 同一プロンプト＝同一画像は再利用（§8.3）。
      const reuse = findAssetByHash(stored.work, promptHash, scene.id);
      if (reuse) {
        scene.assets = [{ ...reuse, id: randomUUID(), sceneId: scene.id, cost: 0 }];
        scene.seed = seed;
        scene.status = "image_ready";
        await this.d.repo.save(stored);
        return;
      }

      const img = await this.d.imageProvider.generate({
        prompt: built.prompt,
        negativePrompt: built.negativePrompt,
        aspectRatio: built.aspectRatio,
        seed,
      });
      const key = `${workId}/${scene.id}-${img.seed}.${extFor(img.contentType)}`;
      const obj = await this.d.storage.put(key, img.data, img.contentType);

      const asset: Asset = {
        id: randomUUID(),
        sceneId: scene.id,
        kind: "image",
        storageUrl: obj.url,
        providerId: this.d.imageProvider.id,
        contentHash: promptHash,
        cost: img.cost,
        status: "ready",
        meta: { contentType: img.contentType, seed: img.seed, aspectRatio: built.aspectRatio },
      };
      scene.assets = [asset];
      scene.seed = img.seed;
      scene.status = "image_ready";

      stored.costSpentUSD += img.cost;
      if (stored.costSpentUSD >= stored.capUSD) stored.capReached = true;
      await this.d.repo.save(stored);
    } catch (err) {
      scene.status = "failed";
      await this.d.repo.save(stored);
      // ジョブとしては失敗を伝播（queue が failed として記録）。シーンは failed のまま。
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}

function segmentToScene(s: SegmentedScene, workId: string): Scene {
  return {
    id: randomUUID(),
    workId,
    orderIndex: s.index,
    sourceStart: s.sourceStart,
    sourceEnd: s.sourceEnd,
    summary: s.summary,
    imagePrompt: "",
    directingNotes: {
      setting: s.setting.place,
      timeOfDay: s.setting.timeOfDay,
      characters: s.charactersPresent,
      mood: s.mood,
      cameraView: s.shotSuggestion,
    },
    panelPriority: s.panelPriority,
    videoCandidate: s.videoCandidate,
    status: "captioned",
    assets: [],
  };
}

function sceneToSegmented(scene: Scene): SegmentedScene {
  return {
    index: scene.orderIndex,
    sourceStart: scene.sourceStart,
    sourceEnd: scene.sourceEnd,
    summary: scene.summary,
    setting: {
      place: scene.directingNotes.setting,
      timeOfDay: scene.directingNotes.timeOfDay,
      weather: "",
    },
    charactersPresent: scene.directingNotes.characters ?? [],
    keyAction: scene.summary,
    mood: scene.directingNotes.mood ?? "",
    shotSuggestion: scene.directingNotes.cameraView ?? "medium shot",
    panelPriority: scene.panelPriority,
    videoCandidate: scene.videoCandidate,
  };
}

function findAssetByHash(work: Work, hash: string, exceptSceneId: string): Asset | undefined {
  for (const s of work.scenes) {
    if (s.id === exceptSceneId) continue;
    const a = s.assets.find((x) => x.contentHash === hash && x.status === "ready");
    if (a) return a;
  }
  return undefined;
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}

function seedFromHash(hash: string, i: number): number {
  return (parseInt(hash.slice(0, 8), 16) + i * 7919) % 2_147_483_647;
}

function extFor(contentType: string): string {
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}
