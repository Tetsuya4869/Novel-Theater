import { NextResponse } from "next/server";
import { getService } from "@/lib/services";

export const runtime = "nodejs";

/** シーン個別の再生成（§3.3 / Phase 1）。 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ workId: string; sceneId: string }> },
) {
  const { workId, sceneId } = await ctx.params;
  const ok = await getService().regenerate(workId, sceneId);
  if (!ok) {
    return NextResponse.json({ error: "再生成できませんでした" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
