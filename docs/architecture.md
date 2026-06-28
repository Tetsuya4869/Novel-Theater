# アーキテクチャ（実装の現状）

PLAN.md §6 の三層分離を、Phase 0 では「最も薄い縦切り」として実装している。

```
apps/
  web/                 Next.js（フロント + 薄い BFF / Route Handlers）
packages/
  config/              環境変数検証(zod) + モデル定数/料金
  types/               共有ドメイン型 + 生成プロバイダのアダプタ interface
  core/                純粋関数（正規化 / ハッシュ / オフセット↔シーン）
  storage/             オブジェクトストレージ抽象（Phase 0: LocalStorage）
  ai/                  AI 抽象化レイヤ（核）
    llm/               Claude ラッパ（adaptive thinking / structured outputs / refusal）
    segment/           シーン分割（Claude / ヒューリスティック）
    prompt/            画像プロンプト構築（Claude / テンプレート）
    image/             ImageProvider（dummy / fal アダプタ）
    pipeline.ts        テキスト→シーン→プロンプト→コマ絵→保存
    factory.ts         env から依存一式を組み立てる
scripts/
  spike.ts             Phase 0 検証 CLI（UI より先に三大リスクを可視化）
```

## 設計上の要点

- **三層分離を最初から崩さない**: フロントは軽く、生成ロジックは `packages/ai` に集約。`apps/web` と将来の `apps/worker` は `packages/ai`・`packages/types` を共有し、契約を型で固定する。
- **アダプタ抽象**: LLM / 画像 / 動画 / 音声はすべて `packages/types` の interface 越しに呼ぶ。プロバイダ差し替え・フォールバック・A/B を可能にする（§7.9）。
- **オフライン動作**: API キーやプロバイダ未設定でも、ヒューリスティック分割＋ダミー画像で全経路が動く。三大リスクの検証を止めない。
- **GitHub Pages の扱い**: `docs/` 配下を Pages 専用とし、アプリ本体は別アーキテクチャ（§1.5）。
- **既知の Phase 0 簡略化**:
  - 永続化は未導入（Web はプロセス内メモリの一時ストア。再起動で消える）。DB/キューは Phase 1。
  - LLM が返すオフセットは検証・クランプして堅牢化（R8）。破綻時は均等割りにフォールバック。
  - 動画化・ナレーションは未実装（Phase 2/3）。

## 生成パイプライン（Phase 0 範囲）

```
原文 → 正規化 → シーン分割(Claude/heuristic) → 画像プロンプト(Claude/template)
     → コマ絵生成(ImageProvider) → ストレージ保存 → Work(scenes+assets)
```

現在地周辺のみを先読み生成（先頭から `maxImages` 枚、コスト上限内）。1 シーンの失敗は全体を止めない。
