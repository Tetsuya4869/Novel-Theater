# Novel-Theater

小説、文章をコマ絵、動画化しながら読める Chrome 拡張機能。

閲覧中の小説ページ（小説家になろう / カクヨム）の本文を抽出し、LLM がシーン分割して
各コマの画像プロンプトを生成、クラウド画像生成 API でコマ絵を描き、サイドパネルに
本文と並べて表示します（将来的に紙芝居スタイルの動画化に対応予定）。

## 特徴

- 対象サイト: 小説家になろう（ncode.syosetu.com）/ カクヨム（kakuyomu.jp）
- シーン解析: Claude / Gemini を切り替え可能
- 画像生成: OpenAI（gpt-image-1 / DALL·E）/ Google Imagen / Stability AI を切り替え可能
- **拡張機能のみで完結**（バックエンドなし）。API キーはユーザーが自分のものを設定

> **API キーについて**: キーはこの端末の `chrome.storage` に保存され、選択した
> プロバイダの API にのみ送信されます。バックエンドがないため、キーをサーバーで
> 秘匿することはできません。共有端末では保存スコープを「session」にしてください。

## 開発

```bash
npm install      # 依存をインストール
npm run dev      # 開発ビルド（HMR）
npm run build    # 本番ビルド → dist/
npm test         # 抽出器・スキーマのユニットテスト
npm run typecheck
```

### 拡張機能の読み込み

1. `npm run build`
2. `chrome://extensions` を開き「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」で `dist/` を選択
4. なろう / カクヨム の本文ページを開くと右下に「🎬 コマ絵化」ボタンが出ます

## アーキテクチャ

```
src/
├─ background/   service worker（メッセージルータ・パイプライン）
├─ content/      本文抽出（SiteAdapter: narou / kakuyomu）・launcher 注入
├─ sidepanel/    コマ表示 UI（React）
├─ options/      API キー・プロバイダ設定（React）
├─ popup/        サイドパネルを開く
├─ video/        紙芝居動画（Ken Burns・字幕・TTS・WebM 書き出し）
└─ shared/       型・Zod スキーマ・設定・メッセージング
```

## ロードマップ

- **M1 骨格 + 抽出** ✅ — 章を抽出してサイドパネルに本文を表示
- **M2 LLM シーン解析** ✅ — 本文 → SceneAnalysis(JSON)（Claude / Gemini）
- **M3 画像生成 + コマ表示** ✅ — 各コマの画像を生成して表示（OpenAI / Imagen / Stability）・IndexedDB キャッシュ・単一コマ再生成
- **M4 仕上げ** ✅ — 読書位置同期（本文⇄コマ連動）・コスト確認ダイアログ・エラー再試行 UX
- **M5 動画（紙芝居）** ✅ — Ken Burns・字幕焼き込み・TTS ナレーション・WebM 書き出し

すべてのマイルストーンが実装済みです。

## ライセンス

[LICENSE](./LICENSE) を参照。
