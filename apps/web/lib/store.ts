import type { Work } from "@novel-theater/types";

/**
 * Phase 0 の一時ストア（プロセス内メモリ）。
 * 再起動で消える。永続化（Postgres）は Phase 1 で導入する。
 * HMR を跨いで保持するため globalThis に置く。
 */
const g = globalThis as unknown as { __ntWorks?: Map<string, Work> };
const works: Map<string, Work> = g.__ntWorks ?? (g.__ntWorks = new Map());

export function saveWork(work: Work): void {
  works.set(work.id, work);
}

export function getWork(id: string): Work | undefined {
  return works.get(id);
}
