import { NextResponse } from "next/server";
import { getService } from "@/lib/services";
import { getSession } from "@/lib/session";
import { toWorkView } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ workId: string }> }) {
  const { workId } = await ctx.params;
  const service = getService();
  const session = await getSession();
  const stored = await service.getForViewer(workId, session?.userId);
  if (!stored) {
    // 非公開作品も区別せず 404（存在を漏らさない）。
    return NextResponse.json({ error: "作品が見つかりません" }, { status: 404 });
  }
  return NextResponse.json(toWorkView(stored, { canEdit: service.canEdit(stored, session?.userId) }));
}
