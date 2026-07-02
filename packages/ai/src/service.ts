import { randomUUID } from "node:crypto";
import { contentHash, normalizeText } from "@novel-theater/core";
import type { Env } from "@novel-theater/config";
import type { StoredWork, WorkRepository } from "@novel-theater/db";
import type { JobQueue } from "@novel-theater/queue";
import type { Storage } from "@novel-theater/storage";
import type {
  AspectRatio,
  Asset,
  Character,
  ImageProvider,
  PromptBuilder,
  Scene,
  SceneSegmenter,
  SegmentedScene,
  StoryBible,
  VideoProvider,
  VoiceProvider,
  Work,
  WorkSettings,
} from "@novel-theater/types";
import { segmentFullText } from "./segment/fulltext";
import { maxVideosForLevel, selectHighlightIndices } from "./highlights";
import type { BibleBuilder } from "./bible";
import type { NarrationWriter } from "./narration";
import type { ConsistencyChecker, ConsistencyCharacter } from "./consistency";
import { trace } from "./obs";

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
  videoProvider: VideoProvider;
  voiceProvider: VoiceProvider;
  bibleBuilder: BibleBuilder;
  narrationWriter: NarrationWriter;
  consistencyChecker: ConsistencyChecker;
}

export interface PlanOptions {
  title?: string;
  style?: string;
  language?: string;
  /** 投入直後に先読み生成するシーン数。 */
  prefetchCount?: number;
  costLimitUSD?: number;
  /** "none" | "highlight" | "rich"（動画化レベル §7.6）。 */
  videoLevel?: Work["settings"]["videoLevel"];
  /** ナレーション音声を生成するか（§7.7）。 */
  narration?: boolean;
  /** Story Bible を構築するか（§7.4）。既定 true。 */
  buildBible?: boolean;
  /** 所有ユーザー ID（Phase 4）。ログイン時に設定するとライブラリに表示される。 */
  ownerId?: string;
  /** 公開範囲（Phase 4 §10）。既定 private。 */
  visibility?: Work["visibility"];
}

const MAX_CONSISTENCY_ATTEMPTS = 2;

/** 「すでに画像が存在する（再生成すると動画/完成物を壊す）」シーン状態。 */
const SCENE_HAS_IMAGE: ReadonlySet<string> = new Set([
  "image_ready",
  "image_generating",
  "video_ready",
  "video_generating",
]);

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
  /** 作品ごとの直列化ロック。共有された StoredWork への read-modify-write 競合を防ぐ。 */
  private readonly workLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly d: GenerationServiceDeps) {}

  /**
   * 同一 workId の処理を直列化する（§Phase1 のインプロセス・キュー前提の暫定対策）。
   * 異なる作品は並列のまま。本番は Postgres の行ロック等に置き換える。
   */
  private withWorkLock<T>(workId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.workLocks.get(workId) ?? Promise.resolve();
    const result = prev.then(fn, fn);
    // チェーンが途切れないよう、エラーを飲み込んだ tail を次のロックとして保持。
    this.workLocks.set(
      workId,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  async plan(text: string, opts: PlanOptions = {}): Promise<PlanResult> {
    const normalized = normalizeText(text);
    const settings: WorkSettings = {
      style: opts.style ?? DEFAULT_STYLE,
      panelDensity: "medium",
      videoLevel: opts.videoLevel ?? "none",
      narration: opts.narration ?? false,
    };
    // 所有者ごとにキャッシュを分ける（別ユーザーが同一テキストで他人の作品を引かないように）。
    const hash = contentHash([normalized, JSON.stringify(settings), opts.ownerId ?? "anon", "v1"]);

    const cachedWork = await this.d.repo.findByContentHash(hash);
    if (cachedWork) {
      // 再投入時に公開範囲の変更を反映する（キャッシュは所有者単位なので所有者本人のみ到達）。
      if (
        opts.visibility &&
        opts.visibility !== cachedWork.work.visibility &&
        this.canEdit(cachedWork, opts.ownerId)
      ) {
        await this.setVisibility(cachedWork.work.id, opts.visibility, opts.ownerId);
      }
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
      visibility: opts.visibility ?? "private",
      contentHash: hash,
      settings,
      scenes,
    };
    const now = Date.now();
    const stored: StoredWork = {
      work,
      ownerId: opts.ownerId,
      costSpentUSD: 0,
      capUSD: opts.costLimitUSD ?? this.d.env.NT_COST_LIMIT_USD,
      capReached: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.d.repo.save(stored);

    // Story Bible（一貫性エンジン §7.4）はジョブ化して投入し、リクエストをブロックしない。
    // priority -1 で先頭に実行され、ロックによりシーン生成より先に参照画像が揃う。
    if (opts.buildBible !== false) {
      this.d.queue.add({
        id: `${workId}:bible`,
        priority: -1,
        run: () => this.withWorkLock(workId, () => this.buildBible(workId).then(() => undefined)),
      });
    }

    const prefetch = opts.prefetchCount ?? 4;
    await this.enqueueScenes(workId, range(0, Math.min(prefetch, scenes.length)));

    // 動画化レベルに応じてハイライトを自動で動画ジョブへ（§7.6）。
    const maxVideos = maxVideosForLevel(settings.videoLevel);
    if (maxVideos > 0) {
      const highlights = selectHighlightIndices(scenes, maxVideos);
      await this.enqueueVideos(workId, highlights);
    }

    // ナレーション有効なら現在地周辺の音声を生成（§7.7）。
    if (settings.narration) {
      await this.enqueueNarration(workId, range(0, Math.min(prefetch, scenes.length)));
    }

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
      // image_ready / image_generating はもちろん、video_ready / video_generating も
      // 「画像は出来ている」状態なので再生成しない（先読みで動画を消さない）。
      if (!opts.force && SCENE_HAS_IMAGE.has(scene.status)) continue;
      if (stored.capReached && !opts.force) continue;

      const jobId = opts.force
        ? `${workId}:${i}:r${Date.now()}:${this.forceCounter++}`
        : `${workId}:${i}`;
      if (!opts.force && this.d.queue.has(jobId)) continue;

      this.d.queue.add({
        id: jobId,
        priority: i,
        run: () => this.withWorkLock(workId, () => this.runSceneJob(workId, i, Boolean(opts.force))),
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

  /** ハイライト等を動画ジョブへ投入する（§7.6）。戻り値は投入数。 */
  async enqueueVideos(
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
      if (!opts.force && scene.status === "video_ready") continue;
      if (scene.status === "video_generating") continue;
      if (stored.capReached && !opts.force) continue;

      const jobId = opts.force
        ? `${workId}:v${i}:r${Date.now()}:${this.forceCounter++}`
        : `${workId}:v${i}`;
      if (!opts.force && this.d.queue.has(jobId)) continue;

      // 画像より後（現在地の画像生成を優先）。
      this.d.queue.add({
        id: jobId,
        priority: 1000 + i,
        run: () => this.withWorkLock(workId, () => this.runVideoJob(workId, i, Boolean(opts.force))),
      });
      enqueued++;
    }
    return enqueued;
  }

  /** 「このコマを動かす」明示トリガ（§7.6）。 */
  async animateScene(workId: string, sceneId: string): Promise<boolean> {
    const stored = await this.d.repo.get(workId);
    if (!stored) return false;
    const i = stored.work.scenes.findIndex((s) => s.id === sceneId);
    if (i < 0) return false;
    const n = await this.enqueueVideos(workId, [i], { force: true });
    return n > 0;
  }

  // --- Phase 3: Story Bible / ナレーション / 編集 ---------------------------

  /**
   * Story Bible を構築し、各キャラの参照画像を生成して referenceImageUrl に保存する（§7.4）。
   * 以降のシーン生成はこの参照を注入して一貫性を高める（レベル2）。
   */
  async buildBible(workId: string): Promise<StoryBible | undefined> {
    const stored = await this.d.repo.get(workId);
    if (!stored) return undefined;

    const built = await this.d.bibleBuilder.build(stored.work);
    const characters: Character[] = built.characters.map((c) => ({ ...c, id: randomUUID() }));
    const bible: StoryBible = {
      workId,
      artStyle: built.artStyle,
      worldSetting: built.worldSetting,
      characters,
    };

    // キャラの参照画像を生成（コスト上限内）。
    for (const ch of characters) {
      if (stored.costSpentUSD >= stored.capUSD) {
        stored.capReached = true;
        break;
      }
      await this.generateReferenceImage(stored, bible, ch);
    }

    stored.bible = bible;
    await this.d.repo.save(stored);
    return bible;
  }

  /** ナレーション音声ジョブを投入する（§7.7）。戻り値は投入数。 */
  async enqueueNarration(
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
      if (!opts.force && hasAudio(scene)) continue;
      if (stored.capReached && !opts.force) continue;

      const jobId = opts.force
        ? `${workId}:n${i}:r${Date.now()}:${this.forceCounter++}`
        : `${workId}:n${i}`;
      if (!opts.force && this.d.queue.has(jobId)) continue;

      this.d.queue.add({
        id: jobId,
        priority: 2000 + i,
        run: () => this.withWorkLock(workId, () => this.runNarrationJob(workId, i)),
      });
      enqueued++;
    }
    return enqueued;
  }

  /** シーンのナレーションを生成する明示トリガ。 */
  async narrateScene(workId: string, sceneId: string): Promise<boolean> {
    const stored = await this.d.repo.get(workId);
    if (!stored) return false;
    const i = stored.work.scenes.findIndex((s) => s.id === sceneId);
    if (i < 0) return false;
    const n = await this.enqueueNarration(workId, [i], { force: true });
    return n > 0;
  }

  /** キャラクター設定を編集し、参照画像を再生成する（§7.4 キャラ設定エディタ）。 */
  async updateCharacter(
    workId: string,
    characterId: string,
    patch: { name?: string; appearance?: string; visualTags?: string[] },
  ): Promise<boolean> {
    return this.withWorkLock(workId, async () => {
      const stored = await this.d.repo.get(workId);
      if (!stored?.bible) return false;
      const ch = stored.bible.characters.find((c) => c.id === characterId);
      if (!ch) return false;
      if (patch.name !== undefined) ch.name = patch.name;
      if (patch.appearance !== undefined) ch.appearance = { description: patch.appearance };
      if (patch.visualTags !== undefined) ch.visualTags = patch.visualTags;
      await this.generateReferenceImage(stored, stored.bible, ch);
      await this.d.repo.save(stored);
      return true;
    });
  }

  /** シーンの画像プロンプトを手動編集する（§7.4 プロンプト手動編集）。 */
  async updateScenePrompt(workId: string, sceneId: string, prompt: string): Promise<boolean> {
    return this.withWorkLock(workId, async () => {
      const stored = await this.d.repo.get(workId);
      if (!stored) return false;
      const scene = stored.work.scenes.find((s) => s.id === sceneId);
      if (!scene) return false;
      scene.imagePrompt = prompt;
      scene.promptLocked = true;
      await this.d.repo.save(stored);
      return true;
    });
  }

  /**
   * 未生成/失敗シーンを同期的に処理する（worker / バッチ / テスト用）。
   * `skipFailed` を渡すと failed シーンを再処理しない（worker のポーリングが
   * 決定論的に失敗するシーンで有料 API を無限に叩くのを防ぐ。復旧は明示的な再生成で行う）。
   */
  async processPending(
    workId: string,
    opts: { force?: boolean; skipFailed?: boolean } = {},
  ): Promise<void> {
    const stored = await this.d.repo.get(workId);
    if (!stored) return;
    for (let i = 0; i < stored.work.scenes.length; i++) {
      const scene = stored.work.scenes[i]!;
      if (!opts.force && SCENE_HAS_IMAGE.has(scene.status)) continue;
      if (opts.skipFailed && scene.status === "failed") continue;
      // 失敗は当該シーンに閉じ込め、残りのシーンの処理を続行する（§7.10）。
      // runSceneJob 内で scene.status は failed に設定済み。ロックで共有オブジェクト競合を防ぐ。
      try {
        await this.withWorkLock(workId, () => this.runSceneJob(workId, i, Boolean(opts.force)));
      } catch {
        /* シーン単位の失敗は無視して継続 */
      }
    }
  }

  getStored(workId: string): Promise<StoredWork | undefined> {
    return this.d.repo.get(workId);
  }

  // --- Phase 4: アカウント / 公開範囲 / ライブラリ（§10「広げる」） ----------

  /** 編集権限の判定。所有者本人のみ編集可。匿名作品（ownerId 未設定）は誰でも編集可（開発既定）。 */
  canEdit(stored: StoredWork, userId?: string): boolean {
    if (!stored.ownerId) return true;
    return Boolean(userId) && stored.ownerId === userId;
  }

  /** 閲覧権限を考慮して作品を取得する。非公開は所有者のみ。 */
  async getForViewer(workId: string, userId?: string): Promise<StoredWork | undefined> {
    const stored = await this.d.repo.get(workId);
    if (!stored) return undefined;
    const v = stored.work.visibility;
    // public / unlisted は誰でも閲覧可。private は所有者のみ。
    if (v === "private" && !this.canEdit(stored, userId)) return undefined;
    return stored;
  }

  /** 公開範囲を変更する（所有者のみ）。成功で true。 */
  async setVisibility(
    workId: string,
    visibility: Work["visibility"],
    userId?: string,
  ): Promise<boolean> {
    return this.withWorkLock(workId, async () => {
      const stored = await this.d.repo.get(workId);
      if (!stored) return false;
      if (!this.canEdit(stored, userId)) return false;
      stored.work.visibility = visibility;
      await this.d.repo.save(stored);
      return true;
    });
  }

  /** 自分のライブラリ（新しい順 §10 DoD「保存して後日見返せる」）。 */
  listMine(userId: string): Promise<StoredWork[]> {
    return this.d.repo.listByUser(userId);
  }

  /** 公開ギャラリー（§10「他人の作品を読む」）。 */
  listPublic(): Promise<StoredWork[]> {
    return this.d.repo.listPublic();
  }

  /**
   * いいねを 1 加算する（§10 軽いソーシャル）。閲覧可能な作品のみ。
   * 戻り値は加算後のいいね数（閲覧不可なら undefined）。
   * 開発用の素朴な実装（多重いいね防止やレート制限は本番で追加）。
   */
  async like(workId: string, userId?: string): Promise<number | undefined> {
    return this.withWorkLock(workId, async () => {
      const stored = await this.d.repo.get(workId);
      if (!stored) return undefined;
      // 非公開作品は所有者のみいいね可（実質、閲覧可能なら可）。
      if (stored.work.visibility === "private" && !this.canEdit(stored, userId)) return undefined;
      stored.likeCount = (stored.likeCount ?? 0) + 1;
      await this.d.repo.save(stored);
      return stored.likeCount;
    });
  }

  // -------------------------------------------------------------------------

  /** 1 シーン分の画像生成ジョブ。失敗は当該シーンに閉じ込め全体を止めない（§7.10）。 */
  private async runSceneJob(workId: string, index: number, force: boolean): Promise<void> {
    const stored = await this.d.repo.get(workId);
    if (!stored) return;
    const scene = stored.work.scenes[index];
    if (!scene) return;
    // 既に画像/動画が出来ているシーンは再生成しない（force 時のみ通す）。
    if (!force && SCENE_HAS_IMAGE.has(scene.status)) return;

    // コスト上限ガード（§7.11 / §11.2）。
    if (stored.costSpentUSD >= stored.capUSD) {
      stored.capReached = true;
      scene.status = "placeholder";
      await this.d.repo.save(stored);
      return;
    }

    const startedAt = Date.now();
    scene.status = "image_generating";
    await this.d.repo.save(stored);

    try {
      // 手動編集済みプロンプトはそのまま使う（§7.4 プロンプト手動編集）。
      let prompt: string;
      let negative: string | undefined;
      let aspect: AspectRatio = "4:3";
      if (scene.promptLocked && scene.imagePrompt) {
        prompt = scene.imagePrompt;
        negative = scene.negativePrompt;
        aspect = previousAspectRatio(scene) ?? "4:3"; // 既存コマのアスペクト比を保つ
      } else {
        const built = await this.d.promptBuilder.build(
          sceneToSegmented(scene),
          stored.work.settings.style,
          stored.bible,
        );
        prompt = built.prompt;
        negative = built.negativePrompt;
        aspect = built.aspectRatio;
        scene.imagePrompt = prompt;
        scene.negativePrompt = negative;
      }

      // 一貫性レベル2: 登場キャラの参照画像を注入（§7.4）。
      const referenceImages = referenceImagesForScene(scene, stored.bible);
      const shouldCheck =
        this.d.consistencyChecker.id !== "noop" &&
        (scene.panelPriority >= 4 || isFirstAppearance(stored.work, index));

      const maxAttempts = shouldCheck ? MAX_CONSISTENCY_ATTEMPTS : 1;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (stored.costSpentUSD >= stored.capUSD) {
          stored.capReached = true;
          break;
        }
        const seed =
          force || attempt > 0
            ? (seedFromHash(stored.work.contentHash, index) +
                this.forceCounter++ * 101 +
                attempt * 7 +
                Date.now()) %
              2_147_483_647
            : seedFromHash(stored.work.contentHash, index);
        const promptHash = contentHash([prompt, seed, this.d.imageProvider.id, referenceImages.join(",")]);

        // content_hash キャッシュ: 同一プロンプト＝同一画像は再利用（§8.3）。初回のみ。
        if (attempt === 0 && !force) {
          const reuse = findAssetByHash(stored.work, promptHash, scene.id);
          if (reuse) {
            scene.assets = mergeAssets(scene, { ...reuse, id: randomUUID(), sceneId: scene.id, cost: 0 });
            scene.seed = seed;
            scene.status = "image_ready";
            await this.d.repo.save(stored);
            trace("scene.image.reuse", { workId, sceneId: scene.id, ms: Date.now() - startedAt });
            return;
          }
        }

        const img = await this.d.imageProvider.generate({
          prompt,
          negativePrompt: negative,
          aspectRatio: aspect,
          seed,
          referenceImages,
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
          meta: { contentType: img.contentType, seed: img.seed, aspectRatio: aspect },
        };
        scene.assets = mergeAssets(scene, asset);
        scene.seed = img.seed;
        scene.status = "image_ready";
        stored.costSpentUSD += img.cost;
        if (stored.costSpentUSD >= stored.capUSD) stored.capReached = true;
        await this.d.repo.save(stored);

        if (!shouldCheck) break;

        // Claude Vision 整合チェック（§7.8）。NG かつ残り試行があればプロンプトを修正して再生成。
        const result = await this.d.consistencyChecker.check({
          imageData: toBase64(img.data),
          mediaType: img.contentType,
          sceneSummary: scene.summary,
          style: stored.work.settings.style,
          characters: consistencyCharacters(scene, stored.bible),
        });
        stored.costSpentUSD += result.costUSD;
        await this.d.repo.save(stored);

        if (result.consistent || attempt === maxAttempts - 1) {
          trace("scene.image.checked", {
            workId,
            sceneId: scene.id,
            consistent: result.consistent,
            attempt,
            ms: Date.now() - startedAt,
          });
          break;
        }
        // 次の試行へ: 提案プロンプト or ネガティブ強化。
        if (result.suggestedPrompt) prompt = result.suggestedPrompt;
        else negative = negative ? `${negative}, inconsistent` : "inconsistent";
      }

      // ループがコマ絵を生成せずに終了した場合（途中でコスト上限に到達等）は
      // image_generating のまま放置せず終端状態にする（スピナー固着の防止）。
      if (scene.status === "image_generating") {
        scene.status = readyImage(scene) ? "image_ready" : "placeholder";
        await this.d.repo.save(stored);
      }
    } catch (err) {
      scene.status = "failed";
      await this.d.repo.save(stored);
      // ジョブとしては失敗を伝播（queue が failed として記録）。シーンは failed のまま。
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /** キャラクターの参照画像を 1 枚生成して referenceImageUrl に保存する（§7.4）。 */
  private async generateReferenceImage(
    stored: StoredWork,
    bible: StoryBible,
    ch: Character,
  ): Promise<void> {
    if (stored.costSpentUSD >= stored.capUSD) {
      stored.capReached = true;
      return;
    }
    try {
      const appearance = ch.appearance.description ?? "";
      const prompt = [
        bible.artStyle.description,
        "character reference sheet",
        ch.name,
        appearance,
        ch.visualTags.join(", "),
      ]
        .filter(Boolean)
        .join(", ");
      const seed = seedFromHash(contentHash([ch.id]), 0);
      const img = await this.d.imageProvider.generate({ prompt, aspectRatio: "2:3", seed });
      const key = `${stored.work.id}/bible/${ch.id}.${extFor(img.contentType)}`;
      const obj = await this.d.storage.put(key, img.data, img.contentType);
      ch.referenceImageUrl = obj.url;
      ch.defaultSeed = img.seed;
      stored.costSpentUSD += img.cost;
      if (stored.costSpentUSD >= stored.capUSD) stored.capReached = true;
    } catch {
      // 参照画像の生成失敗は致命ではない（レベル1 のテキスト一貫性で継続）。
      trace("bible.reference.failed", { workId: stored.work.id });
    }
  }

  /** 1 シーンのナレーション音声ジョブ（§7.7）。失敗は無視（音声なしで継続）。 */
  private async runNarrationJob(workId: string, index: number): Promise<void> {
    const stored = await this.d.repo.get(workId);
    if (!stored) return;
    const scene = stored.work.scenes[index];
    if (!scene) return;
    if (stored.costSpentUSD >= stored.capUSD) {
      stored.capReached = true;
      await this.d.repo.save(stored);
      return;
    }
    const sceneText = stored.work.sourceText.slice(scene.sourceStart, scene.sourceEnd);
    try {
      const script = await this.d.narrationWriter.write({
        sceneText,
        summary: scene.summary,
        language: stored.work.language,
      });
      const audio = await this.d.voiceProvider.synthesize({
        text: script.script,
        voiceId: script.voiceId,
        lang: stored.work.language,
      });
      const key = `${workId}/${scene.id}-audio.${extForAudio(audio.contentType)}`;
      const obj = await this.d.storage.put(key, audio.data, audio.contentType);
      const asset: Asset = {
        id: randomUUID(),
        sceneId: scene.id,
        kind: "audio",
        storageUrl: obj.url,
        providerId: this.d.voiceProvider.id,
        contentHash: contentHash([script.script, this.d.voiceProvider.id]),
        cost: audio.cost,
        status: "ready",
        meta: { contentType: audio.contentType, durationSec: audio.durationSec, script: script.script },
      };
      scene.assets = [...scene.assets.filter((a) => a.kind !== "audio"), asset];
      stored.costSpentUSD += audio.cost;
      if (stored.costSpentUSD >= stored.capUSD) stored.capReached = true;
      await this.d.repo.save(stored);
      trace("scene.narration", { workId, sceneId: scene.id, costUSD: audio.cost });
    } catch (err) {
      trace("scene.narration.failed", { workId, sceneId: scene.id });
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /**
   * 1 シーンの image-to-video ジョブ（§7.6）。
   * 画像が未生成なら先に生成し、コスト上限内で動画化する。
   * 失敗時は静止画へフォールバック（scene を image_ready に戻し、全体は止めない）。
   */
  private async runVideoJob(workId: string, index: number, force: boolean): Promise<void> {
    let stored = await this.d.repo.get(workId);
    if (!stored) return;
    let scene = stored.work.scenes[index];
    if (!scene) return;
    if (!force && scene.status === "video_ready") return;

    if (stored.costSpentUSD >= stored.capUSD) {
      stored.capReached = true;
      await this.d.repo.save(stored); // 画像はそのまま（静止画フォールバック）。
      return;
    }

    // 動画化にはコマ絵が必要。無ければ先に生成する。
    let image = readyImage(scene);
    if (!image) {
      try {
        await this.runSceneJob(workId, index, false);
      } catch {
        /* 画像生成失敗。下で再確認して諦める。 */
      }
      stored = (await this.d.repo.get(workId))!;
      scene = stored.work.scenes[index]!;
      image = readyImage(scene);
      if (!image) return; // 画像が用意できなければ動画化はスキップ。
    }

    scene.status = "video_generating";
    await this.d.repo.save(stored);

    try {
      const durationSec = clampDuration(scene.sourceEnd - scene.sourceStart);
      const motionPrompt = scene.summary || scene.imagePrompt || "subtle camera motion";
      const vid = await this.d.videoProvider.animate({
        sourceImageUrl: image.storageUrl,
        motionPrompt,
        durationSec,
      });
      const videoHash = contentHash([image.contentHash, this.d.videoProvider.id, durationSec]);
      const key = `${workId}/${scene.id}-video.${extForVideo(vid.contentType)}`;
      const obj = await this.d.storage.put(key, vid.data, vid.contentType);

      const asset: Asset = {
        id: randomUUID(),
        sceneId: scene.id,
        kind: "video",
        storageUrl: obj.url,
        providerId: this.d.videoProvider.id,
        contentHash: videoHash,
        cost: vid.cost,
        status: "ready",
        meta: { contentType: vid.contentType, durationSec },
      };
      // 既存の動画アセットは置き換え、画像アセットは残す（静止画フォールバック用）。
      scene.assets = [...scene.assets.filter((a) => a.kind !== "video"), asset];
      scene.status = "video_ready";

      stored.costSpentUSD += vid.cost;
      if (stored.costSpentUSD >= stored.capUSD) stored.capReached = true;
      await this.d.repo.save(stored);
    } catch (err) {
      // 動画生成失敗 → 静止画へフォールバック（§7.10 / Phase 2 DoD）。
      scene.status = "image_ready";
      await this.d.repo.save(stored);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}

function readyImage(scene: Scene): Asset | undefined {
  return scene.assets.find((a) => a.kind === "image" && a.status === "ready");
}

/** 既存コマ絵のアスペクト比を取り出す（手動プロンプト再生成で比率を維持するため）。 */
function previousAspectRatio(scene: Scene): AspectRatio | undefined {
  const img = scene.assets.find((a) => a.kind === "image");
  const ar = img?.meta?.["aspectRatio"];
  return typeof ar === "string" ? (ar as AspectRatio) : undefined;
}

function clampDuration(chars: number): number {
  return Math.max(2, Math.min(6, Math.round((2 + chars / 120) * 10) / 10));
}

function extForVideo(contentType: string): string {
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("webm")) return "webm";
  return "mp4";
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

function extForAudio(contentType: string): string {
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  if (contentType.includes("ogg")) return "ogg";
  return "wav";
}

function hasAudio(scene: Scene): boolean {
  return scene.assets.some((a) => a.kind === "audio" && a.status === "ready");
}

/** 画像差し替え時のアセット統合: 新画像 + 既存音声を残し、陳腐化した動画は除去する。 */
function mergeAssets(scene: Scene, image: Asset): Asset[] {
  return [image, ...scene.assets.filter((a) => a.kind === "audio")];
}

/** シーンに登場するキャラの参照画像 URL を集める（一貫性レベル2 §7.4）。 */
function referenceImagesForScene(scene: Scene, bible?: StoryBible): string[] {
  if (!bible) return [];
  const names = new Set(scene.directingNotes.characters ?? []);
  const urls: string[] = [];
  for (const c of bible.characters) {
    if (names.has(c.name) && c.referenceImageUrl) urls.push(c.referenceImageUrl);
  }
  return urls;
}

/** 整合チェック用にシーン登場キャラの設定を整形する（§7.8）。 */
function consistencyCharacters(scene: Scene, bible?: StoryBible): ConsistencyCharacter[] {
  if (!bible) return [];
  const names = new Set(scene.directingNotes.characters ?? []);
  return bible.characters
    .filter((c) => names.has(c.name))
    .map((c) => ({
      name: c.name,
      appearance: c.appearance.description ?? "",
      visualTags: c.visualTags,
    }));
}

/** 当該シーンで初登場するキャラがいるか（§7.8 のヒューリスティック）。 */
function isFirstAppearance(work: Work, index: number): boolean {
  const scene = work.scenes[index];
  if (!scene) return false;
  const current = scene.directingNotes.characters ?? [];
  if (current.length === 0) return false;
  const seen = new Set<string>();
  for (let i = 0; i < index; i++) {
    for (const n of work.scenes[i]!.directingNotes.characters ?? []) seen.add(n);
  }
  return current.some((n) => !seen.has(n));
}

function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}
