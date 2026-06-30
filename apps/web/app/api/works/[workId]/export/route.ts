import { NextResponse } from "next/server";
import { renderWorkHtml } from "@novel-theater/export";
import { getService } from "@/lib/services";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * 作品を単一 HTML としてエクスポートする（§10 Phase 4 DoD「最低 1 種のエクスポート」）。
 * 閲覧権限を満たす作品のみ。画像は同一デプロイの相対 URL を絶対化して埋め込む。
 */
export async function GET(req: Request, ctx: { params: Promise<{ workId: string }> }) {
  const { workId } = await ctx.params;
  const session = await getSession();
  const stored = await getService().getForViewer(workId, session?.userId);
  if (!stored) {
    return NextResponse.json({ error: "作品が見つかりません" }, { status: 404 });
  }

  const baseUrl = new URL(req.url).origin;
  const html = renderWorkHtml(stored.work, { baseUrl });
  const filename = `novel-theater-${workId}.html`;
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
