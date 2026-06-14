// パイプライン中核: text → LLM 解析 → 画像生成。
import type { ChapterRef, ExtractedChapter, JobState, PanelProgress, SceneAnalysis } from '@/shared/types';
import { broadcast } from '@/shared/messaging';
import { loadSettings, settingsHash } from '@/shared/settings';
import { fromSettings } from '@/shared/prompts/sceneAnalysis';
import {
  blobToDataUrl,
  getCachedChapter,
  saveAnalysis,
  savePanelImage,
} from '@/shared/cache/chapterCache';
import { createLLMProvider } from '../api/llm';
import { createImageProvider } from '../api/image';
import { ConcurrencyLimiter, withRetry } from './rateLimiter';
import { getActive, newJob, patchActive, setActive, updateJob } from './jobStore';

const IMAGE_CONCURRENCY = 2;

function emitJob(job: JobState): void {
  broadcast({ kind: 'event', type: 'job:update', job });
}

/** 章のジョブを開始する（抽出 → 解析 → 画像生成）。 */
export async function startJob(chapter: ExtractedChapter): Promise<string> {
  const settings = await loadSettings();
  const hash = await settingsHash(settings);
  const job = newJob(chapter.ref);

  await setActive({ chapter, job, analysis: null, settingsHash: hash });

  // キャッシュ命中なら即復元。
  const cached = await getCachedChapter(chapter.ref, hash);
  if (cached) {
    job.phase = 'done';
    job.panels = cached.analysis.panels.map((p) => ({
      index: p.index,
      status: cached.images[p.index] ? 'done' : 'pending',
    }));
    await patchActive({ analysis: cached.analysis, job });
    emitJob(job);
    for (const [idx, blob] of Object.entries(cached.images)) {
      broadcast({
        kind: 'event',
        type: 'panel:image',
        ref: chapter.ref,
        index: Number(idx),
        dataUrl: await blobToDataUrl(blob),
      });
    }
    return refId(chapter.ref);
  }

  // 非同期で本処理を進める（呼び出し側はすぐ返す）。
  void runPipeline(chapter, settings, hash).catch(async (e) => {
    await updateJob({ phase: 'error', error: String((e as Error).message ?? e) });
    const a = await getActive();
    if (a) emitJob(a.job);
  });

  return refId(chapter.ref);
}

async function runPipeline(
  chapter: ExtractedChapter,
  settings: Awaited<ReturnType<typeof loadSettings>>,
  hash: string,
): Promise<void> {
  // 1) LLM 解析
  let job = (await updateJob({ phase: 'analyzing' }))!;
  emitJob(job);

  const llm = createLLMProvider(settings);
  const analysis: SceneAnalysis = await llm.analyze({
    prompt: fromSettings(settings, chapter.title, chapter.rawText),
  });
  await saveAnalysis(chapter.ref, analysis, hash);

  const panels: PanelProgress[] = analysis.panels.map((p) => ({
    index: p.index,
    status: 'pending',
  }));
  job = (await patchActive({ analysis, job: { ...job, phase: 'generating', panels } }))!.job;
  emitJob(job);

  // 2) 画像生成（並列上限つき）
  const image = createImageProvider(settings);
  const limiter = new ConcurrencyLimiter(IMAGE_CONCURRENCY);

  await Promise.all(
    analysis.panels.map((panel) =>
      limiter.run(async () => {
        await setPanelStatus(panel.index, 'generating');
        try {
          const { blob } = await withRetry(() =>
            image.generate({
              prompt: composePrompt(analysis, panel.imagePrompt),
              size: settings.image.size,
              seed: image.capabilities.supportsSeed ? seedFor(panel.index) : undefined,
            }),
          );
          await savePanelImage(chapter.ref, hash, panel.index, blob);
          broadcast({
            kind: 'event',
            type: 'panel:image',
            ref: chapter.ref,
            index: panel.index,
            dataUrl: await blobToDataUrl(blob),
          });
          await setPanelStatus(panel.index, 'done');
        } catch (e) {
          await setPanelStatus(panel.index, 'error', String((e as Error).message ?? e));
        }
      }),
    ),
  );

  const finished = await updateJob({ phase: 'done' });
  if (finished) emitJob(finished);
}

/** styleGuide を先頭に必ず織り込む（LLM が漏らした場合の保険）。 */
function composePrompt(analysis: SceneAnalysis, imagePrompt: string): string {
  return imagePrompt.includes(analysis.styleGuide)
    ? imagePrompt
    : `${analysis.styleGuide}。${imagePrompt}`;
}

function seedFor(index: number): number {
  return 1000 + index;
}

async function setPanelStatus(
  index: number,
  status: PanelProgress['status'],
  error?: string,
): Promise<void> {
  const active = await getActive();
  if (!active) return;
  const panels = active.job.panels.map((p) =>
    p.index === index ? { index, status, error } : p,
  );
  const job = { ...active.job, panels };
  await setActive({ ...active, job });
  emitJob(job);
}

/** 単一コマの再生成。 */
export async function regeneratePanel(
  ref: ChapterRef,
  index: number,
  promptOverride?: string,
): Promise<void> {
  const active = await getActive();
  if (!active || !active.analysis) return;
  const settings = await loadSettings();
  const panel = active.analysis.panels.find((p) => p.index === index);
  if (!panel) return;

  await setPanelStatus(index, 'generating');
  const image = createImageProvider(settings);
  try {
    const { blob } = await withRetry(() =>
      image.generate({
        prompt: composePrompt(active.analysis!, promptOverride ?? panel.imagePrompt),
        size: settings.image.size,
        seed: image.capabilities.supportsSeed ? seedFor(index) : undefined,
      }),
    );
    await savePanelImage(ref, active.settingsHash, index, blob);
    broadcast({
      kind: 'event',
      type: 'panel:image',
      ref,
      index,
      dataUrl: await blobToDataUrl(blob),
    });
    await setPanelStatus(index, 'done');
  } catch (e) {
    await setPanelStatus(index, 'error', String((e as Error).message ?? e));
  }
}

function refId(ref: ChapterRef): string {
  return `${ref.site}:${ref.workId}:${ref.chapterId}`;
}
