import type { StoredWork } from "@novel-theater/db";
import type { Work } from "@novel-theater/types";

export interface WorkView {
  work: Work;
  status: {
    total: number;
    ready: number;
    generating: number;
    failed: number;
    pending: number;
    costSpentUSD: number;
    capUSD: number;
    capReached: boolean;
  };
}

/** StoredWork を UI/JSON 用の安全なビューへ整形する。 */
export function toWorkView(stored: StoredWork): WorkView {
  const scenes = stored.work.scenes;
  const count = (pred: (s: Work["scenes"][number]) => boolean) => scenes.filter(pred).length;
  return {
    work: stored.work,
    status: {
      total: scenes.length,
      ready: count((s) => s.status === "image_ready"),
      generating: count((s) => s.status === "image_generating"),
      failed: count((s) => s.status === "failed"),
      pending: count((s) => s.status === "captioned" || s.status === "pending"),
      costSpentUSD: stored.costSpentUSD,
      capUSD: stored.capUSD,
      capReached: stored.capReached,
    },
  };
}
