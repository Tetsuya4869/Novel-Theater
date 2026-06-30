import Link from "next/link";
import { getService } from "@/lib/services";
import { WorkGrid, toSummary } from "@/components/WorkGrid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 公開ギャラリー（§10「他人の作品を読む」）。`?sort=popular` で人気順。 */
export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const popular = sort === "popular";

  const stored = await getService().listPublic(); // 既定は新しい順
  if (popular) {
    stored.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
  }
  const works = stored.map((s) => toSummary(s));

  return (
    <main className="container container--wide">
      <h1>公開ギャラリー</h1>
      <p className="muted">公開設定の作品。クリックで「観る読書」を開始します。</p>
      <div className="modebar">
        <Link className={`btn btn--sm ${popular ? "btn--ghost" : ""}`} href="/gallery">
          新着順
        </Link>
        <Link className={`btn btn--sm ${popular ? "" : "btn--ghost"}`} href="/gallery?sort=popular">
          人気順
        </Link>
      </div>
      <WorkGrid works={works} />
    </main>
  );
}
