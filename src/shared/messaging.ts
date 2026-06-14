// content / sidepanel / popup ↔ background 間の型付き RPC とイベント定義。
import type { ChapterRef, ExtractedChapter, JobState, SceneAnalysis } from './types';

/** リクエスト/レスポンス型の RPC マップ。 */
export interface RpcMap {
  /** content script が現在ページの章を抽出して background へ渡し、ジョブを開始する。 */
  startJob: { req: { chapter: ExtractedChapter }; res: { jobId: string } };
  /** 現在のジョブ状態を取得。 */
  getJob: { req: { ref: ChapterRef }; res: { job: JobState | null } };
  /** 直近にサイドパネル対象となった章を取得（M1: 抽出テキスト表示用）。 */
  getActiveChapter: { req: Record<string, never>; res: { chapter: ExtractedChapter | null; job: JobState | null } };
  /** 解析結果（テキストコマ）の取得。M2 で利用。 */
  getAnalysis: { req: { ref: ChapterRef }; res: { analysis: SceneAnalysis | null } };
  /** content script へ「この章を抽出してほしい」と依頼（サイドパネル/ポップアップから）。 */
  requestExtract: { req: Record<string, never>; res: { ok: boolean } };
  /** 単一コマの再生成（M4）。 */
  regeneratePanel: { req: { ref: ChapterRef; index: number; promptOverride?: string }; res: { ok: boolean } };
}

export type RpcMethod = keyof RpcMap;

export interface RpcEnvelope<M extends RpcMethod = RpcMethod> {
  kind: 'rpc';
  method: M;
  payload: RpcMap[M]['req'];
}

/** background → サイドパネルへ push するイベント。 */
export type PushEvent =
  | { kind: 'event'; type: 'job:update'; job: JobState }
  | { kind: 'event'; type: 'panel:image'; ref: ChapterRef; index: number; dataUrl: string }
  | { kind: 'event'; type: 'visible:paragraph'; ref: ChapterRef; paragraph: number };

/** background 側で RPC を送る（content script を対象にできる）。 */
export function sendRpc<M extends RpcMethod>(
  method: M,
  payload: RpcMap[M]['req'],
): Promise<RpcMap[M]['res']> {
  const env: RpcEnvelope<M> = { kind: 'rpc', method, payload };
  return chrome.runtime.sendMessage(env) as Promise<RpcMap[M]['res']>;
}

/** タブ（content script）へ向けて RPC を送る。 */
export function sendRpcToTab<M extends RpcMethod>(
  tabId: number,
  method: M,
  payload: RpcMap[M]['req'],
): Promise<RpcMap[M]['res']> {
  const env: RpcEnvelope<M> = { kind: 'rpc', method, payload };
  return chrome.tabs.sendMessage(tabId, env) as Promise<RpcMap[M]['res']>;
}

/** イベントを全リスナへ broadcast する。 */
export function broadcast(event: PushEvent): void {
  chrome.runtime.sendMessage(event).catch(() => {
    /* 受信側がいない場合のエラーは無視 */
  });
}

export function isRpcEnvelope(msg: unknown): msg is RpcEnvelope {
  return typeof msg === 'object' && msg !== null && (msg as { kind?: string }).kind === 'rpc';
}

export function isPushEvent(msg: unknown): msg is PushEvent {
  return typeof msg === 'object' && msg !== null && (msg as { kind?: string }).kind === 'event';
}
