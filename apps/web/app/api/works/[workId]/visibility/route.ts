import { NextResponse } from "next/server";
import { getService } from "@/lib/services";
import { guardEditable } from "@/lib/guard";
import { isVisibility } from "@/lib/visibility";

export const runtime = "nodejs";

/** 公開範囲を変更する（所有者のみ・§10）。 */
export async function POST(req: Request, ctx: { params: Promise<{ workId: string }> }) {
  const { workId } = await ctx.params;
  const guard = await guardEditable(workId);
  if (!guard.ok) return guard.response;

  let body: { visibility?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON ボディが不正です" }, { status: 400 });
  }
  if (!isVisibility(body.visibility)) {
    return NextResponse.json({ error: "visibility が不正です" }, { status: 400 });
  }

  const ok = await getService().setVisibility(workId, body.visibility, guard.userId);
  return NextResponse.json({ ok, visibility: body.visibility });
}
