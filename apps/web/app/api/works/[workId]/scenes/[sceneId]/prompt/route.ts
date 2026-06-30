import { NextResponse } from "next/server";
import { getService } from "@/lib/services";

export const runtime = "nodejs";

/** シーンの画像プロンプトを手動編集する（§7.4）。再生成時はこのプロンプトが使われる。 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ workId: string; sceneId: string }> },
) {
  const { workId, sceneId } = await ctx.params;
  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON ボディが不正です" }, { status: 400 });
  }
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "プロンプトが空です" }, { status: 400 });

  const ok = await getService().updateScenePrompt(workId, sceneId, prompt);
  if (!ok) return NextResponse.json({ error: "シーンが見つかりません" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
