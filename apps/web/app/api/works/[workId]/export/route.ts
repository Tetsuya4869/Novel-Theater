import { NextResponse } from "next/server";
import { renderWork, type ExportFormat } from "@novel-theater/export";
import { getService } from "@/lib/services";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * 作品をエクスポートする（§10 Phase 4 DoD「最低 1 種のエクスポート」、HTML / Markdown 対応）。
 * 閲覧権限を満たす作品のみ。画像は同一デプロイの相対 URL を絶対化して埋め込む。
 * `?format=html|md`（既定 html）。
 */
export async function GET(req: Request, ctx: { params: Promise<{ workId: string }> }) {
  const { workId } = await ctx.params;
  const session = await getSession();
  const stored = await getService().getForViewer(workId, session?.userId);
  if (!stored) {
    return NextResponse.json({ error: "作品が見つかりません" }, { status: 404 });
  }

  const fmt = new URL(req.url).searchParams.get("format");
  const format: ExportFormat = fmt === "md" ? "md" : "html";
  const baseUrl = new URL(req.url).origin;
  const { body, contentType, ext } = renderWork(stored.work, format, { baseUrl });
  return new NextResponse(body, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="novel-theater-${workId}.${ext}"`,
    },
  });
}
