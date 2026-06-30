/**
 * 最小の構造化ログ（可観測性の足場 §11.5）。
 * 本番では OpenTelemetry / Sentry へ差し替える。ここでは外部依存なしの JSON ログのみ。
 */
export interface TraceFields {
  traceId?: string;
  workId?: string;
  sceneId?: string;
  ms?: number;
  costUSD?: number;
  [k: string]: unknown;
}

export function trace(event: string, fields: TraceFields = {}): void {
  // テスト中（VITEST）や明示無効（NT_LOG=0）のときは出力しない。
  if (process.env.VITEST || process.env.NT_LOG === "0") return;
  try {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ src: "novel-theater", event, ...fields }));
  } catch {
    /* ログ失敗は無視 */
  }
}
