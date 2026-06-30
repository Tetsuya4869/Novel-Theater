import { getService } from "@/lib/services";
import { WorkGrid, toSummary } from "@/components/WorkGrid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 公開ギャラリー（§10「他人の作品を読む」）。 */
export default async function GalleryPage() {
  const stored = await getService().listPublic();
  const works = stored.map((s) => toSummary(s.work));

  return (
    <main className="container container--wide">
      <h1>公開ギャラリー</h1>
      <p className="muted">公開設定の作品（新しい順）。クリックで「観る読書」を開始します。</p>
      <WorkGrid works={works} />
    </main>
  );
}
