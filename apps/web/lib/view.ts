import type { StoredWork } from "@novel-theater/db";
import { buildTimeline } from "@novel-theater/ai";
import type { StoryBible, TimelineItem, Work } from "@novel-theater/types";

export interface WorkView {
  work: Work;
  timeline: TimelineItem[];
  bible?: StoryBible;
  /** 閲覧者が編集（再生成・公開設定など）できるか（Phase 4）。 */
  canEdit: boolean;
  /** いいね数（Phase 4 軽いソーシャル）。 */
  likeCount: number;
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
export function toWorkView(stored: StoredWork, opts: { canEdit?: boolean } = {}): WorkView {
  const scenes = stored.work.scenes;
  const count = (pred: (s: Work["scenes"][number]) => boolean) => scenes.filter(pred).length;
  return {
    work: stored.work,
    timeline: buildTimeline(stored.work),
    bible: stored.bible,
    canEdit: opts.canEdit ?? false,
    likeCount: stored.likeCount ?? 0,
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
