// ジョブ状態と直近の抽出章を保持する。MV3 の SW は再起動しうるため
// chrome.storage.session に永続化して復元可能にする。
import type { ChapterRef, ExtractedChapter, JobState } from '@/shared/types';

const ACTIVE_KEY = 'nt:active';

interface ActiveState {
  chapter: ExtractedChapter;
  job: JobState;
}

function refKey(ref: ChapterRef): string {
  return `${ref.site}:${ref.workId}:${ref.chapterId}`;
}

export async function setActive(chapter: ExtractedChapter, job: JobState): Promise<void> {
  const state: ActiveState = { chapter, job };
  await chrome.storage.session.set({ [ACTIVE_KEY]: state });
}

export async function getActive(): Promise<ActiveState | null> {
  const r = await chrome.storage.session.get(ACTIVE_KEY);
  return (r[ACTIVE_KEY] as ActiveState) ?? null;
}

export async function updateJob(patch: Partial<JobState>): Promise<JobState | null> {
  const active = await getActive();
  if (!active) return null;
  const job: JobState = { ...active.job, ...patch };
  await chrome.storage.session.set({ [ACTIVE_KEY]: { ...active, job } });
  return job;
}

export function newJob(ref: ChapterRef): JobState {
  return { ref, phase: 'extracting', panels: [] };
}

export { refKey };
