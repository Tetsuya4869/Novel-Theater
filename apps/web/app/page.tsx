import Link from "next/link";

export default function Home() {
  return (
    <main className="container">
      <h1>Novel-Theater</h1>
      <p className="muted">
        小説・文章を、読みながらコマ絵（マンガ風パネル）に自動変換して「観ながら読む」体験。
      </p>
      <p>
        テキストを貼り付けると、シーンに分割して各シーンのコマ絵を生成します。
        読み進めるとビジュアルがスクロールに追従して切り替わります。
      </p>
      <p style={{ marginTop: "2rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link className="btn" href="/compose">
          自分のテキストで試す →
        </Link>
        <Link className="btn btn--ghost" href="/gallery">
          公開ギャラリーを見る
        </Link>
      </p>
      <p className="muted" style={{ marginTop: "3rem", fontSize: "0.9rem" }}>
        ログインすると作品を保存して後日見返せます（マイライブラリ）。公開設定にすると
        ギャラリーに掲載され、URL での共有や HTML / Markdown への書き出しもできます。
      </p>
    </main>
  );
}
