# アーキテクチャ（実装の現状）

PLAN.md §6 の三層分離を、Phase 0 では「最も薄い縦切り」として実装している。

```
apps/
  web/                 Next.js（フロント + 薄い BFF / Route Handlers）
packages/
  config/              環境変数検証(zod) + モデル定数/料金
  types/               共有ドメイン型 + 生成プロバイダのアダプタ interface
  core/                純粋関数（正規化 / ハッシュ / オフセット↔シーン）
  storage/             オブジェクトストレージ抽象（LocalStorage）
  db/                  永続化抽象 WorkRepository（InMemory / File）+ Prisma schema
  queue/               ジョブキュー抽象 JobQueue（InProcessJobQueue ワーカープール）
  ai/                  AI 抽象化レイヤ（核）
    llm/               Claude ラッパ（adaptive thinking / structured outputs / refusal）
    segment/           シーン分割（Claude / ヒューリスティック）+ 全文チャンク分割
    prompt/            画像プロンプト構築（Claude / テンプレート）
    image/             ImageProvider（dummy / fal アダプタ）
    video/             VideoProvider（dummy=アニメSVG / fal i2v アダプタ; Phase 2）
    voice/             VoiceProvider（dummy=WAV / ElevenLabs アダプタ; Phase 3）
    bible/             Story Bible 構築（Claude / ヒューリスティック; Phase 3）
    narration/         ナレーション台本生成（Claude / ヒューリスティック; Phase 3）
    consistency/       整合チェック（Claude Vision / Noop; Phase 3）
    highlights.ts      ハイライト選択 / videoLevel→本数 / 再生タイムライン生成
    obs.ts             最小の構造化ログ（可観測性の足場; Phase 3）
    pipeline.ts        テキスト→シーン→プロンプト→コマ絵→保存（同期; spike 用）
    service.ts         GenerationService（plan/先読み/再生成/動画化/Bible/ナレーション/編集/コスト上限）
    factory.ts         env から依存一式を組み立てる
scripts/
  spike.ts             Phase 0 検証 CLI（UI より先に三大リスクを可視化）
```

## Phase 1（読める劇場）の追加点

非同期生成の流れ:

```
POST /api/generate
  → 正規化 → content_hash でキャッシュ判定（再投入は既存 workId を即返す）
  → 全文をシーン分割（章チャンク）→ 全シーンを captioned で永続化（WorkRepository）
  → 現在地周辺(先頭4)の画像ジョブを JobQueue へ投入 → { workId } を返す
リーダー（クライアント）
  → /api/works/:id をポーリングして状態を反映（プレースホルダ→差し替え）
  → スクロールに追従し /api/works/:id/prefetch で現在地周辺を先読み
  → 目次サムネで各シーンの状態を可視化、/scenes/:id/regenerate で個別再生成
ワーカー（InProcessJobQueue）
  → 各シーン: プロンプト構築 → content_hash 再利用 or 画像生成 → 保存 → 状態更新
  → コスト上限到達で以降を placeholder 化（capReached）。1 シーンの失敗は全体を止めない。
```

- **キュー＋ワーカー**: `JobQueue` interface が seam。Phase 1 既定は同一プロセスの
  `InProcessJobQueue`（並列度制限のワーカープール）。本番は BullMQ + Redis アダプタを実装し、
  `apps/worker` として別プロセスへ切り出して水平スケールする（§6 / §11.5）。
- **永続化**: `WorkRepository` interface。Phase 1 既定は `FileWorkRepository`（`.data/works`、
  content_hash 索引つき）。本番は `prisma/schema.prisma`（§8.1 の ER 図）に基づく
  Postgres 実装へ差し替える。`DATABASE_URL` で切り替える設計。
- **コスト/信頼性**: 作品単位のコスト上限（`capUSD`）をワーカーで強制、`content_hash`
  によるアセット再利用、シーン個別リトライ、入力長上限（`NT_MAX_INPUT_CHARS`）。
- **体感速度**: プログレッシブ表示（captioned→生成中→ready）＋先読み＋擬似アニメ
  （Ken Burns、`prefers-reduced-motion` 尊重）。TTFM を北極星指標に置く（§11.1）。

## Phase 2（動かす / 動画化）の追加点

- **VideoProvider（image-to-video）**: コマ絵起点で 2〜6 秒の短尺を生成（§7.6）。既定は
  `DummyVideoProvider`（アニメーション SVG をクリップ代用に生成しオフライン検証可能）。本番は
  `FalVideoProvider`（fal i2v、要 API キー・公開画像 URL）。`VIDEO_PROVIDER` で切替。
- **ハイライト判定**: `video_candidate` かつ `panel_priority` の高いシーンを `videoLevel`
  （none/highlight=2/rich=5）に応じて自動動画化。加えて「このコマを動かす」で個別トリガ
  （`/api/works/:id/scenes/:sceneId/animate`）。全件動画化はしない（コスト）。
- **動画ジョブ**: 画像未生成なら先に生成 → 動画化。コスト上限を強制し、**失敗時は静止画へ
  フォールバック**（scene を image_ready に戻す）。画像アセットは動画と併存させ常に静止画で代替可能。
- **シアター（没入）モード**: `TIMELINE_ITEM`（各シーンの表示尺）で自動進行する `ImmersivePlayer`。
  全画面・前後送り・再生/一時停止。read（スクロール同期）↔ watch（自動再生）をユーザー設定で切替（§3.7）。
- **既知の簡略化**: ダミー動画は SVG アニメ（本物の mp4 ではない）。fal i2v は LocalStorage の
  相対 URL では到達できないため本番の公開 URL が前提。動画コスト単価はプロバイダ確定後に設定。

## Phase 3（一貫させる & 語らせる）の追加点

- **Story Bible（一貫性エンジン §7.4）**: 本文からキャラ（外見・視覚タグ）と画風を抽出
  （`ClaudeBibleBuilder`、オフラインは `HeuristicBibleBuilder`）。各キャラの参照画像を 1 枚生成して
  `referenceImageUrl` に保存し、以降のシーン生成へ注入（一貫性レベル2）。キャラ設定エディタで編集→
  参照画像を再生成できる。
- **Claude Vision 整合チェック（§7.8）**: 生成画像をモデルに渡し、シーン記述・キャラ・画風と整合するか
  判定。NG ならプロンプト修正案で再生成（リトライ上限 2、新キャラ初登場/重要シーンを優先検証）。
  オフラインは `NoopConsistencyChecker`。LLM ラッパは画像入力（Vision）に対応。
- **ナレーション（§7.7）**: 台本生成（`ClaudeNarrationWriter`/ヒューリスティック）＋ TTS
  （`DummyVoiceProvider`=WAV / `ElevenLabsVoiceProvider`）。音声アセットを付与し、`TIMELINE_ITEM`
  の `audioAssetUrl`・尺に反映。シアターモードは音声終了でコマを進める（コマ／本文／音声の同期）。
- **編集（DoD: 任意パネルを修正・再生成）**: 画像プロンプト手動編集（`promptLocked` で再構築をスキップ）、
  キャラ設定編集、シーン個別の再生成/再動画化/ナレーション生成。
- **モデルルーティング（§7.11）**: 難所=Opus（Bible）、量産=Sonnet（ナレーション/整合判定）。
- **可観測性（§11.5）**: `obs.ts` の最小構造化ログ（trace）。本番は OpenTelemetry/Sentry へ。
- **既知の簡略化**: オフラインのヒューリスティック分割は登場人物名を持たないため、Story Bible の
  キャラ抽出は実質 Claude 経路で機能する。ダミー音声はサイン波 WAV（本物の TTS ではない）。
  Vision 整合チェックはダミー画像（SVG）では実効しないため API キー設定時に有効。

## 設計上の要点

- **三層分離を最初から崩さない**: フロントは軽く、生成ロジックは `packages/ai` に集約。`apps/web` と将来の `apps/worker` は `packages/ai`・`packages/types` を共有し、契約を型で固定する。
- **アダプタ抽象**: LLM / 画像 / 動画 / 音声はすべて `packages/types` の interface 越しに呼ぶ。プロバイダ差し替え・フォールバック・A/B を可能にする（§7.9）。
- **オフライン動作**: API キーやプロバイダ未設定でも、ヒューリスティック分割＋ダミー画像で全経路が動く。三大リスクの検証を止めない。
- **GitHub Pages の扱い**: `docs/` 配下を Pages 専用とし、アプリ本体は別アーキテクチャ（§1.5）。
- **既知の簡略化（現状）**:
  - 永続化はファイル（`.data/works`）。本番 Postgres への差し替えは `WorkRepository` で seam 済み。
  - キュー＋ワーカーは同一プロセス（`InProcessJobQueue`）。Redis/BullMQ + 別プロセス worker は `JobQueue` で seam 済み。
  - プロンプト構築（LLM）のコストは未計上（画像コストのみ集計）。動画化・ナレーションは未実装（Phase 2/3）。
  - LLM が返すオフセットは検証・クランプして堅牢化（R8）。破綻時は均等割りにフォールバック。

## 生成パイプライン（Phase 0 範囲）

```
原文 → 正規化 → シーン分割(Claude/heuristic) → 画像プロンプト(Claude/template)
     → コマ絵生成(ImageProvider) → ストレージ保存 → Work(scenes+assets)
```

現在地周辺のみを先読み生成（先頭から `maxImages` 枚、コスト上限内）。1 シーンの失敗は全体を止めない。
