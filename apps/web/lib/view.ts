import type { StoredWork } from "@novel-theater/db";
import { buildTimeline } from "@novel-theater/ai";
import type { TimelineItem, Work } from "@novel-theater/types";

export interface WorkView {
  work: Work;
  timeline: TimelineItem[];
  status: {
    total: number;
    ready: number;
    generating: number;
    failed: number;
    pending: number;
    videoReady: number;
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
    timeline: buildTimeline(stored.work),
    status: {
      total: scenes.length,
      ready: count((s) => s.status === "image_ready" || s.status === "video_ready"),
      generating: count((s) => s.status === "image_generating" || s.status === "video_generating"),
      failed: count((s) => s.status === "failed"),
      pending: count((s) => s.status === "captioned" || s.status === "pending"),
      videoReady: count((s) => s.status === "video_ready"),
      costSpentUSD: stored.costSpentUSD,
      capUSD: stored.capUSD,
      capReached: stored.capReached,
    },
  };
}
