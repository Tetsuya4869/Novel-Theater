import Link from "next/link";
import { getService } from "@/lib/services";
import { getSession } from "@/lib/session";
import { WorkGrid, toSummary } from "@/components/WorkGrid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** マイライブラリ（§10 DoD「保存して後日見返せる」）。 */
export default async function LibraryPage() {
  const session = await getSession();
  if (!session) {
    return (
      <main className="container">
        <h1>マイライブラリ</h1>
        <p className="muted">
          作品を保存・一覧するにはログインしてください（上部の表示名フォームから）。
        </p>
        <p>
          <Link className="btn" href="/compose">
            まずは投入してみる →
          </Link>
        </p>
      </main>
    );
  }

  const stored = await getService().listMine(session.userId);
  const works = stored.map((s) => toSummary(s));

  return (
    <main className="container container--wide">
      <h1>マイライブラリ</h1>
      <p className="muted">{session.name} さんの作品（新しい順）。</p>
      <WorkGrid works={works} />
    </main>
  );
}
