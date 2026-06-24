// Novel-Theater 共通型定義
// 抽出 → LLM 解析 → 画像生成 のパイプライン全体で共有する型。

export type SiteId = 'narou' | 'kakuyomu';

/** 現在表示中の章を一意に指す参照。 */
export interface ChapterRef {
  site: SiteId;
  /** なろうは ncode (例 n1234ab)、カクヨムは work id。 */
  workId: string;
  /** エピソード番号 / part id。単一話作品では 'single'。 */
  chapterId: string;
  url: string;
}

/** サイトアダプタが本文ページから抽出した章データ。 */
export interface ExtractedChapter {
  ref: ChapterRef;
  title: string;
  /** 順序を保った本文段落（ルビは基底テキストへ展開済み）。 */
  paragraphs: string[];
  /** LLM 入力用に連結した本文。 */
  rawText: string;
  charCount: number;
}

// ---- LLM シーン解析の出力スキーマ ----

export interface CharacterRef {
  /** 章内で安定した id 例 "char_aoi"。 */
  id: string;
  name: string;
  /** 髪色 / 服装 / 年齢感 など。一貫性のため全プロンプトへ注入する。 */
  appearance: string;
  /** プロンプトに添える短いタグ（任意）。 */
  seedTag?: string;
}

export interface PanelDialogue {
  speakerId?: string;
  text: string;
}

export interface Panel {
  index: number;
  /** ナレーション / 地の文の要約。 */
  caption?: string;
  dialogue?: PanelDialogue[];
  /** CharacterRef.id の配列。 */
  characterRefs: string[];
  /** プロンプト生成の元になる中立的な情景描写。 */
  sceneDescription: string;
  /** 画像プロバイダへ渡す最終プロンプト。 */
  imagePrompt: string;
  /** 画風ヒント（章共通の styleGuide と整合させる）。 */
  styleHints: string;
  /** この panel に対応する本文段落の範囲 [start, end]（読書位置同期用）。 */
  sourceParagraphs?: [number, number];
}

export interface SceneAnalysis {
  /** 章全体で一定の画風記述。全 imagePrompt に前置する。 */
  styleGuide: string;
  characters: CharacterRef[];
  panels: Panel[];
}

// ---- 設定 ----

export type LLMProviderId = 'claude' | 'gemini';
export type ImageProviderId = 'openai' | 'imagen' | 'stability';
export type StorageScope = 'local' | 'session';

export interface Settings {
  llm: { provider: LLMProviderId; model: string; apiKey: string };
  image: { provider: ImageProviderId; model: string; apiKey: string; size: string };
  panelCount: { min: number; max: number };
  /** ユーザー指定の既定画風。 */
  styleDefault: string;
  /** キーの保存スコープ。session はブラウザ終了で消える。 */
  storageScope: StorageScope;
  /** Phase 2: 動画書き出し時の音声合成。 */
  ttsEnabled?: boolean;
}

// ---- ジョブ / 進捗 ----

export type PanelStatus = 'pending' | 'generating' | 'done' | 'error';

export interface PanelProgress {
  index: number;
  status: PanelStatus;
  error?: string;
}

export type JobPhase = 'idle' | 'extracting' | 'analyzing' | 'generating' | 'done' | 'error';

export interface JobState {
  ref: ChapterRef;
  phase: JobPhase;
  panels: PanelProgress[];
  error?: string;
}
