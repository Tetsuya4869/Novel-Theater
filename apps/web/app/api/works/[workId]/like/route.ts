import { NextResponse } from "next/server";
import { getService } from "@/lib/services";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/** いいねを 1 加算する（§10 軽いソーシャル）。閲覧可能な作品のみ。 */
export async function POST(_req: Request, ctx: { params: Promise<{ workId: string }> }) {
  const { workId } = await ctx.params;
  const session = await getSession();
  const count = await getService().like(workId, session?.userId);
  if (count === undefined) {
    return NextResponse.json({ error: "作品が見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, likeCount: count });
}
