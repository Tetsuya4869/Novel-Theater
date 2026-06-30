import { NextResponse } from "next/server";
import { normalizeAozora } from "@novel-theater/core";
import { getService, maxInputChars } from "@/lib/services";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: {
    text?: string;
    title?: string;
    style?: string;
    videoLevel?: "none" | "highlight" | "rich";
    narration?: boolean;
    visibility?: "private" | "unlisted" | "public";
    aozora?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON ボディが不正です" }, { status: 400 });
  }

  // 青空文庫記法の取り込み（ルビ・注記・凡例・奥付を整形）。
  const text = (body.aozora ? normalizeAozora(body.text ?? "") : (body.text ?? "")).trim();
  if (!text) {
    return NextResponse.json({ error: "テキストが空です" }, { status: 400 });
  }
  const cap = maxInputChars();
  if (text.length > cap) {
    return NextResponse.json({ error: `テキストが長すぎます（上限 ${cap} 文字）` }, { status: 413 });
  }

  try {
    const session = await getSession();
    const result = await getService().plan(text, {
      title: body.title,
      style: body.style,
      videoLevel: body.videoLevel,
      narration: body.narration,
      ownerId: session?.userId,
      visibility: body.visibility,
      prefetchCount: 4,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成計画に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
