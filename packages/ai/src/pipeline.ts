import { randomUUID } from "node:crypto";
import { contentHash, normalizeText } from "@novel-theater/core";
import type { Storage } from "@novel-theater/storage";
import type {
  Asset,
  ImageProvider,
  PromptBuilder,
  Scene,
  SceneSegmenter,
  StoryBible,
  Work,
  WorkSettings,
} from "@novel-theater/types";

export interface PipelineDeps {
  segmenter: SceneSegmenter;
  promptBuilder: PromptBuilder;
  imageProvider: ImageProvider;
  storage: Storage;
}

export interface GenerateOptions {
  title?: string;
  style?: string;
  language?: string;
  /** 分割するシーン数の上限。 */
  maxScenes?: number;
  /** 画像生成するシーン数の上限（現在地周辺の先読みに相当 §7.11）。 */
  maxImages?: number;
  /** 1 リクエストあたりのコスト上限（USD）。超過で画像生成を停止（§7.11）。 */
  costLimitUSD?: number;
  bible?: StoryBible;
}

export interface StepTiming {
  step: string;
  ms: number;
  costUSD?: number;
}

export interface GenerateMetrics {
  segmentMs: number;
  scenes: number;
  imagesGenerated: number;
  imagesFailed: number;
  /** 最初のコマ絵が出るまで（投入 → 最初の image_ready）。TTFM の代理指標（§11.1）。 */
  timeToFirstPanelMs?: number;
  totalCostUSD: number;
  totalMs: number;
  steps: StepTiming[];
}

export interface GenerateResult {
  work: Work;
  metrics: GenerateMetrics;
}

const DEFAULTS = {
  style: "manga panel, ink, monochrome, detailed line art",
  language: "ja",
  maxScenes: 3,
  maxImages: 3,
  costLimitUSD: 1.0,
};

/**
 * Phase 0 の縦切り: テキスト → シーン分割 → 画像プロンプト → コマ絵生成 → ストレージ保存。
 * 「1 シーン失敗しても全体は完了する」設計（§3.5 / Phase 1 DoD）。
 */
export async function generateWork(
  text: string,
  opts: GenerateOptions,
  deps: PipelineDeps,
): Promise<GenerateResult> {
  const start = Date.now();
  const steps: StepTiming[] = [];

  const style = opts.style ?? DEFAULTS.style;
  const language = opts.language ?? DEFAULTS.language;
  const maxScenes = opts.maxScenes ?? DEFAULTS.maxScenes;
  const maxImages = opts.maxImages ?? DEFAULTS.maxImages;
  const costLimit = opts.costLimitUSD ?? DEFAULTS.costLimitUSD;

  const normalized = normalizeText(text);
  const settings: WorkSettings = {
    style,
    panelDensity: "medium",
    videoLevel: "none",
    narration: false,
  };
  const workId = randomUUID();
  const hash = contentHash([normalized, JSON.stringify(settings), "v0"]);

  // 1) シーン分割
  const segStart = Date.now();
  const segments = await deps.segmenter.segment(normalized, { maxScenes, language });
  const segmentMs = Date.now() - segStart;
  steps.push({ step: `segment:${deps.segmenter.id}`, ms: segmentMs });

  const scenes: Scene[] = segments.map((s) => ({
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
  }));

  // 2) 画像生成（現在地周辺を先読み: 先頭から maxImages 枚 / コスト上限内）
  let totalCostUSD = 0;
  let imagesGenerated = 0;
  let imagesFailed = 0;
  let timeToFirstPanelMs: number | undefined;

  const limit = Math.min(maxImages, scenes.length);
  for (let i = 0; i < limit; i++) {
    if (totalCostUSD >= costLimit) break;
    const scene = scenes[i]!;
    const segment = segments[i]!;
    try {
      const built = await deps.promptBuilder.build(segment, style, opts.bible);
      scene.imagePrompt = built.prompt;
      scene.negativePrompt = built.negativePrompt;
      scene.status = "image_generating";

      const imgStart = Date.now();
      const seed = seedFor(hash, i);
      const img = await deps.imageProvider.generate({
        prompt: built.prompt,
        negativePrompt: built.negativePrompt,
        aspectRatio: built.aspectRatio,
        seed,
      });
      const promptHash = contentHash([built.prompt, img.seed, deps.imageProvider.id]);
      const key = `${workId}/${scene.id}.${extFor(img.contentType)}`;
      const stored = await deps.storage.put(key, img.data, img.contentType);

      const asset: Asset = {
        id: randomUUID(),
        sceneId: scene.id,
        kind: "image",
        storageUrl: stored.url,
        providerId: deps.imageProvider.id,
        contentHash: promptHash,
        cost: img.cost,
        status: "ready",
        meta: { contentType: img.contentType, seed: img.seed, aspectRatio: built.aspectRatio },
      };
      scene.assets.push(asset);
      scene.seed = img.seed;
      scene.status = "image_ready";

      totalCostUSD += img.cost;
      imagesGenerated++;
      const at = Date.now() - start;
      if (timeToFirstPanelMs === undefined) timeToFirstPanelMs = at;
      steps.push({ step: `image:${scene.id.slice(0, 8)}`, ms: Date.now() - imgStart, costUSD: img.cost });
    } catch (err) {
      // フォールバック: 当該シーンのみ失敗扱いにし、全体は継続する（§7.10）。
      scene.status = "failed";
      imagesFailed++;
      steps.push({ step: `image:${scene.id.slice(0, 8)}:FAILED (${asMessage(err)})`, ms: 0 });
    }
  }

  const work: Work = {
    id: workId,
    title: opts.title ?? "無題",
    sourceText: normalized,
    language,
    visibility: "private",
    contentHash: hash,
    settings,
    scenes,
  };

  return {
    work,
    metrics: {
      segmentMs,
      scenes: scenes.length,
      imagesGenerated,
      imagesFailed,
      timeToFirstPanelMs,
      totalCostUSD,
      totalMs: Date.now() - start,
      steps,
    },
  };
}

function seedFor(hash: string, i: number): number {
  return (parseInt(hash.slice(0, 8), 16) + i * 7919) % 2_147_483_647;
}

function extFor(contentType: string): string {
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
