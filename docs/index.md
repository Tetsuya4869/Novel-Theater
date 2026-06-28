# Novel-Theater

> 小説・文章を、読みながらコマ絵（マンガ風パネル）と短い動画に自動変換して「観ながら読む」体験。

このディレクトリは GitHub Pages 用の広報／ドキュメントと設計メモです（§9）。
アプリ本体は静的サイト単体では動かない（AI 推論が必要）ため、`apps/`・`packages/` の三層構成で構築します。詳細は [architecture.md](./architecture.md)、計画全体は [../PLAN.md](../PLAN.md) を参照してください。

- 開発計画: [PLAN.md](../PLAN.md)
- アーキテクチャ: [architecture.md](./architecture.md)
- 評価記録（品質/コスト/レイテンシ/一貫性）: [eval.md](./eval.md)

## Phase 0 を試す

```bash
pnpm install
pnpm spike            # テキスト → シーン分割 → コマ絵1枚 → コスト出力（API キー不要）
pnpm test             # 単体テスト
pnpm dev              # 最小 Web リーダー（http://localhost:3000）
```

`ANTHROPIC_API_KEY` 未設定でも、シーン分割はヒューリスティック、画像はダミーにフォールバックして動作します。
