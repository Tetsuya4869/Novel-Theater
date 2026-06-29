import { NextResponse } from "next/server";
import { getService } from "@/lib/services";

export const runtime = "nodejs";

/** 現在地周辺のシーンを先読み生成キューへ投入する（§3.3）。 */
export async function POST(req: Request, ctx: { params: Promise<{ workId: string }> }) {
  const { workId } = await ctx.params;
  let body: { from?: number; count?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const from = Math.max(0, Math.floor(body.from ?? 0));
  const count = Math.min(8, Math.max(1, Math.floor(body.count ?? 4)));
  const indices = Array.from({ length: count }, (_, i) => from + i);

  const enqueued = await getService().enqueueScenes(workId, indices);
  return NextResponse.json({ enqueued });
}
