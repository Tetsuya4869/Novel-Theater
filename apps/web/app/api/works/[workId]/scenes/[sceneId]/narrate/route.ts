import { NextResponse } from "next/server";
import { getService } from "@/lib/services";
import { guardEditable } from "@/lib/guard";

export const runtime = "nodejs";

/** シーンのナレーション音声を生成する（§7.7）。 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ workId: string; sceneId: string }> },
) {
  const { workId, sceneId } = await ctx.params;
  const guard = await guardEditable(workId);
  if (!guard.ok) return guard.response;
  const ok = await getService().narrateScene(workId, sceneId);
  if (!ok) return NextResponse.json({ error: "ナレーションを生成できませんでした" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
