// 紙芝居動画の書き出し。canvas に各コマを Ken Burns + 字幕で描画し、
// captureStream → MediaRecorder で録画する。WebM 出力。
import { loadImage, renderPanelFrame, type FramePanel } from './frame';

export interface AssembleInput {
  panels: { index: number; imageUrl: string; subtitle: string }[];
  width?: number;
  height?: number;
  /** 1 コマあたりの表示秒数。 */
  secondsPerPanel?: number;
  fps?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** MediaRecorder が対応する mime を選ぶ。 */
export function pickMimeType(): string {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const supported =
    typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function';
  return supported ? (candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? 'video/webm') : 'video/webm';
}

export async function exportVideo(input: AssembleInput): Promise<Blob> {
  const width = input.width ?? 1024;
  const height = input.height ?? 1024;
  const fps = input.fps ?? 30;
  const secondsPerPanel = input.secondsPerPanel ?? 3.5;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D コンテキストを取得できません');

  // 先に全画像を読み込む。
  const frames: FramePanel[] = [];
  for (const p of input.panels) {
    const image = await loadImage(p.imageUrl);
    frames.push({ index: p.index, image, subtitle: p.subtitle });
  }
  if (frames.length === 0) throw new Error('書き出すコマがありません');

  const mimeType = pickMimeType();
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start();

  const framesPerPanel = Math.round(secondsPerPanel * fps);
  for (let i = 0; i < frames.length; i++) {
    if (input.signal?.aborted) break;
    for (let f = 0; f < framesPerPanel; f++) {
      const progress = f / (framesPerPanel - 1 || 1);
      renderPanelFrame(ctx, width, height, frames[i], progress);
      await nextFrame(1000 / fps);
    }
    input.onProgress?.(i + 1, frames.length);
  }

  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  return done;
}

function nextFrame(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Blob をダウンロードさせる。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
