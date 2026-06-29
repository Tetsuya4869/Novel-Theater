import { NextResponse } from "next/server";
import { getService } from "@/lib/services";

export const runtime = "nodejs";

/** 「このコマを動かす」: シーンを image-to-video で動画化する（§7.6）。 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ workId: string; sceneId: string }> },
) {
  const { workId, sceneId } = await ctx.params;
  const ok = await getService().animateScene(workId, sceneId);
  if (!ok) {
    return NextResponse.json({ error: "動画化できませんでした" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
