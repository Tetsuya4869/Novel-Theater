import { NextResponse } from "next/server";
import { normalizeAozora } from "@novel-theater/core";
import { getService, maxInputChars } from "@/lib/services";
import { getSession } from "@/lib/session";
import { isVisibility, type Visibility } from "@/lib/visibility";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: {
    text?: string;
    title?: string;
    style?: string;
    videoLevel?: "none" | "highlight" | "rich";
    narration?: boolean;
    visibility?: unknown;
    aozora?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON ボディが不正です" }, { status: 400 });
  }

  // 公開範囲を検証（未指定は private 既定、不正値は 400）。
  let requestedVisibility: Visibility | undefined;
  if (body.visibility !== undefined) {
    if (!isVisibility(body.visibility)) {
      return NextResponse.json({ error: "visibility が不正です" }, { status: 400 });
    }
    requestedVisibility = body.visibility;
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
    // 匿名作品は所有者を特定できず「誰でも編集可」になるため、公開/限定公開にはしない
    // （ギャラリーに世界中から編集可能な作品が並ぶのを防ぐ）。ログイン時のみ公開範囲を尊重する。
    const visibility: Visibility = session ? requestedVisibility ?? "private" : "private";
    const result = await getService().plan(text, {
      title: body.title,
      style: body.style,
      videoLevel: body.videoLevel,
      narration: body.narration,
      ownerId: session?.userId,
      visibility,
      prefetchCount: 4,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成計画に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
