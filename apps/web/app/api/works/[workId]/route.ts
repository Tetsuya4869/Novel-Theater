import { NextResponse } from "next/server";
import { getService } from "@/lib/services";
import { toWorkView } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ workId: string }> }) {
  const { workId } = await ctx.params;
  const stored = await getService().getStored(workId);
  if (!stored) {
    return NextResponse.json({ error: "作品が見つかりません" }, { status: 404 });
  }
  return NextResponse.json(toWorkView(stored));
}
