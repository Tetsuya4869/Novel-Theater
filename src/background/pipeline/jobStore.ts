// ジョブ状態・抽出章・解析結果を保持する。MV3 の SW は再起動しうるため
// chrome.storage.session に永続化して復元可能にする。
import type { ChapterRef, ExtractedChapter, JobState, SceneAnalysis } from '@/shared/types';

const ACTIVE_KEY = 'nt:active';

export interface ActiveState {
  chapter: ExtractedChapter;
  job: JobState;
  analysis: SceneAnalysis | null;
  settingsHash: string;
  /** 起点となったタブ（スクロール中継・再実行に使用）。 */
  tabId?: number;
}

function refKey(ref: ChapterRef): string {
  return `${ref.site}:${ref.workId}:${ref.chapterId}`;
}

export async function setActive(state: ActiveState): Promise<void> {
  await chrome.storage.session.set({ [ACTIVE_KEY]: state });
}

export async function getActive(): Promise<ActiveState | null> {
  const r = await chrome.storage.session.get(ACTIVE_KEY);
  return (r[ACTIVE_KEY] as ActiveState) ?? null;
}

export async function patchActive(patch: Partial<ActiveState>): Promise<ActiveState | null> {
  const active = await getActive();
  if (!active) return null;
  const next = { ...active, ...patch };
  await setActive(next);
  return next;
}

export async function updateJob(patch: Partial<JobState>): Promise<JobState | null> {
  const active = await getActive();
  if (!active) return null;
  const job: JobState = { ...active.job, ...patch };
  await setActive({ ...active, job });
  return job;
}

export function newJob(ref: ChapterRef): JobState {
  return { ref, phase: 'extracting', panels: [] };
}

export { refKey };
