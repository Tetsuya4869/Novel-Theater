import Link from "next/link";
import { getService } from "@/lib/services";
import { toWorkView } from "@/lib/view";
import { Reader } from "@/components/reader/Reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TheaterPage({
  params,
}: {
  params: Promise<{ workId: string }>;
}) {
  const { workId } = await params;
  const stored = await getService().getStored(workId);

  if (!stored) {
    return (
      <main className="container">
        <p>
          <Link href="/compose">← もう一度投入する</Link>
        </p>
        <h1>作品が見つかりません</h1>
        <p className="muted">
          Phase 1 の作品は <code>.data/works</code> に永続化されます。サーバーを別環境で起動した場合は
          作品データが共有されません（本番は Postgres）。
        </p>
      </main>
    );
  }

  const view = toWorkView(stored);

  return (
    <main className="container container--wide">
      <p>
        <Link href="/compose">← もう一度投入する</Link>
      </p>
      <h1>{view.work.title}</h1>
      <Reader initial={view} />
    </main>
  );
}
