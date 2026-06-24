// IndexedDB セットアップ (idb)。生成画像 blob と解析結果を章単位で保存。
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ChapterRef, SceneAnalysis } from '../types';

export interface CachedChapter {
  /** site:workId:chapterId:settingsHash */
  key: string;
  ref: ChapterRef;
  analysis: SceneAnalysis;
  /** index → 画像 blob。 */
  images: Record<number, Blob>;
  settingsHash: string;
  createdAt: number;
}

interface NovelTheaterDB extends DBSchema {
  chapters: {
    key: string;
    value: CachedChapter;
  };
}

let dbPromise: Promise<IDBPDatabase<NovelTheaterDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<NovelTheaterDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NovelTheaterDB>('novel-theater', 1, {
      upgrade(db) {
        db.createObjectStore('chapters', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export function cacheKey(ref: ChapterRef, settingsHash: string): string {
  return `${ref.site}:${ref.workId}:${ref.chapterId}:${settingsHash}`;
}
