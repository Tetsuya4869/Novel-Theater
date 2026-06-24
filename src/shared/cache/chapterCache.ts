// 章キャッシュの読み書き。
import type { ChapterRef, SceneAnalysis } from '../types';
import { cacheKey, getDB, type CachedChapter } from './db';

export async function getCachedChapter(
  ref: ChapterRef,
  settingsHash: string,
): Promise<CachedChapter | null> {
  const db = await getDB();
  return (await db.get('chapters', cacheKey(ref, settingsHash))) ?? null;
}

export async function saveAnalysis(
  ref: ChapterRef,
  analysis: SceneAnalysis,
  settingsHash: string,
): Promise<void> {
  const db = await getDB();
  const key = cacheKey(ref, settingsHash);
  const existing = await db.get('chapters', key);
  const record: CachedChapter = {
    key,
    ref,
    analysis,
    images: existing?.images ?? {},
    settingsHash,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await db.put('chapters', record);
}

export async function savePanelImage(
  ref: ChapterRef,
  settingsHash: string,
  index: number,
  blob: Blob,
): Promise<void> {
  const db = await getDB();
  const key = cacheKey(ref, settingsHash);
  const existing = await db.get('chapters', key);
  if (!existing) return;
  existing.images[index] = blob;
  await db.put('chapters', existing);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${blob.type || 'image/png'};base64,${btoa(bin)}`;
}
