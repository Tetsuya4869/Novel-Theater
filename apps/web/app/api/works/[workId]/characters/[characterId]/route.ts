import { NextResponse } from "next/server";
import { getService } from "@/lib/services";

export const runtime = "nodejs";

/** キャラクター設定を編集し、参照画像を再生成する（§7.4 キャラ設定エディタ）。 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ workId: string; characterId: string }> },
) {
  const { workId, characterId } = await ctx.params;
  let body: { name?: string; appearance?: string; visualTags?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON ボディが不正です" }, { status: 400 });
  }
  const ok = await getService().updateCharacter(workId, characterId, body);
  if (!ok) return NextResponse.json({ error: "キャラクターが見つかりません" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
