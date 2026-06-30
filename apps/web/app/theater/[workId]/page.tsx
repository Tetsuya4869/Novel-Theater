import Link from "next/link";
import { getService } from "@/lib/services";
import { getSession } from "@/lib/session";
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
  const service = getService();
  const session = await getSession();
  const stored = await service.getForViewer(workId, session?.userId);

  if (!stored) {
    return (
      <main className="container">
        <p>
          <Link href="/compose">← もう一度投入する</Link>
        </p>
        <h1>作品が見つかりません</h1>
        <p className="muted">
          非公開作品は所有者のみ閲覧できます。また Phase 1 の作品は <code>.data/works</code> に
          永続化されるため、別環境で起動した場合は共有されません（本番は Postgres）。
        </p>
      </main>
    );
  }

  const canEdit = service.canEdit(stored, session?.userId);
  const view = toWorkView(stored, { canEdit });

  return (
    <main className="container container--wide">
      <p>
        <Link href="/compose">← もう一度投入する</Link>
        {" ・ "}
        <Link href="/gallery">公開ギャラリー</Link>
        {session && (
          <>
            {" ・ "}
            <Link href="/library">マイライブラリ</Link>
          </>
        )}
      </p>
      <h1>{view.work.title}</h1>
      <Reader initial={view} />
    </main>
  );
}
