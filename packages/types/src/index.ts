/**
 * フロント・ワーカー・パイプラインで共有するドメイン型と
 * 生成プロバイダの抽象インターフェース（PLAN.md §7.9 / §8.2）。
 */

// ---------------------------------------------------------------------------
// シーン / アセット / 作品（§8.2）
// ---------------------------------------------------------------------------

export type SceneStatus =
  | "pending"
  | "captioned"
  | "image_generating"
  | "image_ready"
  | "video_generating"
  | "video_ready"
  | "failed"
  | "placeholder";

export type AssetKind = "image" | "video" | "audio";
export type AssetStatus = "generating" | "ready" | "failed";

export interface Asset {
  id: string;
  sceneId: string;
  kind: AssetKind;
  /** オブジェクトストレージ上の参照 URL（DB にはメタのみ） */
  storageUrl: string;
  /** 再現性キーに含めるプロバイダ ID */
  providerId: string;
  /** = hash(最終プロンプト + seed + provider_id + model) */
  contentHash: string;
  cost?: number;
  status: AssetStatus;
  /** 解像度・尺・raw 等 */
  meta: Record<string, unknown>;
}

export interface DirectingNotes {
  setting?: string;
  timeOfDay?: string;
  characters?: string[];
  mood?: string;
  cameraView?: string;
}

export interface Scene {
  id: string;
  workId: string;
  orderIndex: number;
  /** 正規化後本文の開始オフセット（スクロール同期の鍵 §8.3） */
  sourceStart: number;
  /** 終了オフセット */
  sourceEnd: number;
  /** alt テキスト / シーン要約 */
  summary: string;
  imagePrompt: string;
  negativePrompt?: string;
  directingNotes: DirectingNotes;
  /** 1-5 先読み優先度 */
  panelPriority: number;
  videoCandidate: boolean;
  seed?: number;
  status: SceneStatus;
  assets: Asset[];
  /** ユーザーが imagePrompt を手動編集した場合 true。再生成時はプロンプト再構築をスキップする。 */
  promptLocked?: boolean;
}

export type Visibility = "private" | "unlisted" | "public";
export type PanelDensity = "low" | "medium" | "high";
export type VideoLevel = "none" | "highlight" | "rich";

export interface WorkSettings {
  style: string;
  panelDensity: PanelDensity;
  videoLevel: VideoLevel;
  narration: boolean;
}

export interface Work {
  id: string;
  title: string;
  sourceText: string;
  language: string;
  visibility: Visibility;
  /** = sha256(正規化本文 + settings + styleVersion) */
  contentHash: string;
  settings: WorkSettings;
  scenes: Scene[];
}

// ---------------------------------------------------------------------------
// Story Bible（一貫性エンジン §7.4）
// ---------------------------------------------------------------------------

export interface Character {
  id: string;
  name: string;
  appearance: Record<string, unknown>;
  visualTags: string[];
  referenceImageUrl?: string;
  defaultSeed?: number;
}

export interface ArtStyle {
  name: string;
  description: string;
  palette?: string;
  era?: string;
}

export interface StoryBible {
  workId: string;
  artStyle: ArtStyle;
  worldSetting: Record<string, unknown>;
  characters: Character[];
}

// ---------------------------------------------------------------------------
// 再生タイムライン（§7.7 / §8）。シアター再生でコマ／本文／音声を同期する基盤。
// Phase 2 ではシアターモードの自動進行（duration）に使用。音声は Phase 3。
// ---------------------------------------------------------------------------

export interface TimelineItem {
  sceneId: string;
  orderIndex: number;
  startSec: number;
  durationSec: number;
  audioAssetUrl?: string;
}

// ---------------------------------------------------------------------------
// 生成プロバイダのアダプタ（§7.9）
// すべてインターフェース越しに呼び、ベンダーロックインを避ける。
// ---------------------------------------------------------------------------

export type AspectRatio = "16:9" | "4:3" | "1:1" | "2:3";

/** Claude のシーン分割が返す構造化出力（§7.2 の出力スキーマ） */
export interface SegmentedScene {
  index: number;
  sourceStart: number;
  sourceEnd: number;
  summary: string;
  setting: { place?: string; timeOfDay?: string; weather?: string };
  charactersPresent: string[];
  keyAction: string;
  mood: string;
  shotSuggestion: string;
  /** 1-5: 絵にする価値 → 先読み優先度 */
  panelPriority: number;
  /** 動きのあるシーンか */
  videoCandidate: boolean;
}

export interface SegmentOptions {
  /** 生成するシーン数の上限（コスト管理）。 */
  maxScenes?: number;
  language?: string;
}

export interface SceneSegmenter {
  readonly id: string;
  segment(normalizedText: string, opts?: SegmentOptions): Promise<SegmentedScene[]>;
}

/** シーン記述 + Story Bible → 画像生成プロンプト（§7.5） */
export interface BuiltPrompt {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: AspectRatio;
}

export interface PromptBuilder {
  readonly id: string;
  build(scene: SegmentedScene, style: string, bible?: StoryBible): Promise<BuiltPrompt>;
}

export interface ImageGenerateInput {
  prompt: string;
  negativePrompt?: string;
  /** 一貫性用の参照画像 URL（Phase 3 で本格利用） */
  referenceImages?: string[];
  seed?: number;
  aspectRatio: AspectRatio;
}

export interface ImageGenerateResult {
  /** 生成画像のバイト列。永続化は packages/storage が担当する。 */
  data: Uint8Array;
  contentType: string;
  cost: number;
  latencyMs: number;
  seed: number;
}

export interface ImageProvider {
  /** アセット再現性キーに含める */
  readonly id: string;
  generate(input: ImageGenerateInput): Promise<ImageGenerateResult>;
}

// Phase 2/3 で実装する将来のアダプタ（型のみ先に固定）
export interface VideoProvider {
  readonly id: string;
  animate(input: {
    sourceImageUrl: string;
    motionPrompt: string;
    durationSec: number;
  }): Promise<{ data: Uint8Array; contentType: string; cost: number; latencyMs: number }>;
}

export interface VoiceProvider {
  readonly id: string;
  synthesize(input: {
    text: string;
    voiceId: string;
    lang: string;
  }): Promise<{ data: Uint8Array; contentType: string; cost: number; durationSec: number }>;
}
