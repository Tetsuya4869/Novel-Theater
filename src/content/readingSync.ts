// 読書位置同期: IntersectionObserver で可視段落を検出して side panel へ通知し、
// side panel からの scrollToParagraph 要求でページを該当段落へスクロールする。
import { broadcast } from '@/shared/messaging';
import type { ChapterRef } from '@/shared/types';

let elements: Element[] = [];
let observer: IntersectionObserver | null = null;
const visible = new Set<number>();
let lastReported = -1;
let raf = 0;

/** 抽出済み段落要素に対し同期を開始する。 */
export function setupReadingSync(ref: ChapterRef, paragraphEls: Element[]): void {
  teardownReadingSync();
  elements = paragraphEls;
  if (elements.length === 0 || typeof IntersectionObserver === 'undefined') return;

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const idx = elements.indexOf(entry.target);
        if (idx < 0) continue;
        if (entry.isIntersecting) visible.add(idx);
        else visible.delete(idx);
      }
      scheduleReport(ref);
    },
    { rootMargin: '-40% 0px -40% 0px', threshold: 0 },
  );
  elements.forEach((el) => observer!.observe(el));
}

function scheduleReport(ref: ChapterRef): void {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (visible.size === 0) return;
    const top = Math.min(...visible);
    if (top !== lastReported) {
      lastReported = top;
      broadcast({ kind: 'event', type: 'visible:paragraph', ref, paragraph: top });
    }
  });
}

export function teardownReadingSync(): void {
  observer?.disconnect();
  observer = null;
  visible.clear();
  lastReported = -1;
  elements = [];
}

/** side panel からの要求でページを該当段落へスクロールする。 */
export function scrollToParagraph(index: number): void {
  const el = elements[index];
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
