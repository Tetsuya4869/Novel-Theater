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
      <p style={{ marginTop: "2rem" }}>
        <Link className="btn" href="/compose">
          自分のテキストで試す →
        </Link>
      </p>
      <p className="muted" style={{ marginTop: "3rem", fontSize: "0.9rem" }}>
        Phase 0（最小縦切り）。<code>ANTHROPIC_API_KEY</code> 未設定でも、ヒューリスティック分割＋
        ダミー画像で動作します。設計は <code>PLAN.md</code> / <code>docs/</code> を参照。
      </p>
    </main>
  );
}
