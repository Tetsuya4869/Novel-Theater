import { NextResponse } from "next/server";
import { getService } from "@/lib/services";
import { guardEditable } from "@/lib/guard";

export const runtime = "nodejs";

const ALLOWED = new Set(["private", "unlisted", "public"]);

/** 公開範囲を変更する（所有者のみ・§10）。 */
export async function POST(req: Request, ctx: { params: Promise<{ workId: string }> }) {
  const { workId } = await ctx.params;
  const guard = await guardEditable(workId);
  if (!guard.ok) return guard.response;

  let body: { visibility?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON ボディが不正です" }, { status: 400 });
  }
  const visibility = body.visibility;
  if (!visibility || !ALLOWED.has(visibility)) {
    return NextResponse.json({ error: "visibility が不正です" }, { status: 400 });
  }

  const ok = await getService().setVisibility(
    workId,
    visibility as "private" | "unlisted" | "public",
    guard.userId,
  );
  return NextResponse.json({ ok, visibility });
}
