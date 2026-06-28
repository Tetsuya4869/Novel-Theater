import { NextResponse } from "next/server";
import { maxInputChars, runGeneration } from "@/lib/generate";
import { saveWork } from "@/lib/store";

// fs / crypto / 生成パイプラインを使うため Node ランタイムで動かす。
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { text?: string; title?: string; style?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON ボディが不正です" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "テキストが空です" }, { status: 400 });
  }
  const cap = maxInputChars();
  if (text.length > cap) {
    return NextResponse.json(
      { error: `テキストが長すぎます（上限 ${cap} 文字）` },
      { status: 413 },
    );
  }

  try {
    const { work, metrics } = await runGeneration(text, body.title, body.style);
    saveWork(work);
    return NextResponse.json({ workId: work.id, metrics });
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
