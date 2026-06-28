import Link from "next/link";
import { getWork } from "@/lib/store";
import { Reader } from "@/components/reader/Reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TheaterPage({
  params,
}: {
  params: Promise<{ workId: string }>;
}) {
  const { workId } = await params;
  const work = getWork(workId);

  if (!work) {
    return (
      <main className="container">
        <p>
          <Link href="/compose">← もう一度投入する</Link>
        </p>
        <h1>作品が見つかりません</h1>
        <p className="muted">
          Phase 0 の作品はプロセス内メモリに保持され、サーバー再起動で失われます（永続化は Phase 1）。
        </p>
      </main>
    );
  }

  const ready = work.scenes.filter((s) => s.status === "image_ready").length;

  return (
    <main className="container">
      <p>
        <Link href="/compose">← もう一度投入する</Link>
      </p>
      <h1>{work.title}</h1>
      <p className="muted">
        {work.scenes.length} シーン ・ コマ絵 {ready} 枚生成済み
      </p>
      <Reader work={work} />
    </main>
  );
}
