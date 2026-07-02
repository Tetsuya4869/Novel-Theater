import { NextResponse } from "next/server";
import { getService } from "@/lib/services";
import { getSession } from "@/lib/session";

/**
 * 編集系ルートの共通ガード（Phase 4）。所有者でなければエラー応答を返す。
 * 匿名作品（ownerId 未設定）は誰でも編集可（開発既定。本番は要ログイン）。
 * 成功時は認可済みユーザー ID（匿名なら undefined）を返す。
 */
export async function guardEditable(
  workId: string,
): Promise<{ ok: true; userId?: string } | { ok: false; response: NextResponse }> {
  const service = getService();
  const stored = await service.getStored(workId);
  if (!stored) {
    return { ok: false, response: NextResponse.json({ error: "作品が見つかりません" }, { status: 404 }) };
  }
  const session = await getSession();
  if (!service.canEdit(stored, session?.userId)) {
    return { ok: false, response: NextResponse.json({ error: "編集権限がありません" }, { status: 403 }) };
  }
  return { ok: true, userId: session?.userId };
}
