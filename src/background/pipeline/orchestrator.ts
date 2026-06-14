// パイプライン中核: text → (M2) scenes → (M3) images。
// M1 では抽出章を保存しサイドパネルへ通知するところまで。
import type { ExtractedChapter } from '@/shared/types';
import { broadcast } from '@/shared/messaging';
import { newJob, setActive, updateJob } from './jobStore';

/**
 * 章のジョブを開始する。
 * M1: 抽出結果を保存し job:update を broadcast（テキストコマ表示）。
 * M2 以降: ここで LLM 解析 → 画像生成へ続ける。
 */
export async function startJob(chapter: ExtractedChapter): Promise<string> {
  const job = newJob(chapter.ref);
  job.phase = 'done'; // M1: 抽出完了でいったん done 扱い
  await setActive(chapter, job);
  broadcast({ kind: 'event', type: 'job:update', job });
  return `${chapter.ref.site}:${chapter.ref.workId}:${chapter.ref.chapterId}`;
}

/** M2 以降のための再生成エントリ（現状は no-op）。 */
export async function regeneratePanel(): Promise<void> {
  await updateJob({});
}
