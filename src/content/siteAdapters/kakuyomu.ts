// カクヨム (kakuyomu.jp) 用アダプタ。
// Next.js ベースの SPA。本文は hydration 後に DOM へ現れるため待機が必要。
// 構造変化に備え __NEXT_DATA__ JSON と DOM の二重抽出を行う。
import type { SiteAdapter } from './SiteAdapter';
import type { ExtractedChapter } from '@/shared/types';
import {
  buildChapter,
  extractParagraphs,
  normalizeLine,
  queryFirst,
  textWithoutRuby,
  waitForSelector,
} from './utils/dom';

const BODY_SELECTORS = ['.widget-episodeBody', '.js-episode-body', '[class*="episodeBody"]'];
const TITLE_SELECTORS = ['.widget-episodeTitle', 'p.widget-episodeTitle', 'h1'];

export const kakuyomuAdapter: SiteAdapter = {
  site: 'kakuyomu',

  matches(loc) {
    return loc.hostname === 'kakuyomu.jp';
  },

  getChapterRef(loc) {
    // パス形: /works/<workId>/episodes/<episodeId>
    const m = loc.pathname.match(/^\/works\/(\d+)\/episodes\/(\d+)/);
    if (!m) return null;
    return {
      site: 'kakuyomu',
      workId: m[1],
      chapterId: m[2],
      url: loc.href,
    };
  },

  async extract(doc, loc) {
    const ref = this.getChapterRef(loc);
    if (!ref) throw new Error('カクヨムの本文ページではありません');

    // 1) __NEXT_DATA__ からの構造化抽出を試みる。
    const fromNext = extractFromNextData(doc);

    // 2) DOM 抽出（hydration 待機を含む）。
    let bodyEl: Element | null = queryFirst(doc, BODY_SELECTORS);
    if (!bodyEl && typeof MutationObserver !== 'undefined') {
      bodyEl = await waitForSelector(doc, BODY_SELECTORS[0]);
    }

    const titleEl = queryFirst(doc, TITLE_SELECTORS);
    const title =
      fromNext?.title ?? (titleEl ? textWithoutRuby(titleEl).trim() : doc.title);

    let paragraphs: string[];
    if (bodyEl) {
      paragraphs = extractParagraphs(bodyEl);
    } else if (fromNext?.paragraphs?.length) {
      paragraphs = fromNext.paragraphs;
    } else {
      throw new Error('カクヨムの本文を抽出できませんでした');
    }

    const built = buildChapter(paragraphs);
    const chapter: ExtractedChapter = { ref, title, ...built };
    return chapter;
  },
};

interface NextDataResult {
  title?: string;
  paragraphs?: string[];
}

/**
 * __NEXT_DATA__ スクリプトから本文らしきデータを探す。
 * カクヨムの内部構造は変わりうるため、再帰的に走査して
 * "bodyHtml" / "body" / "episodeTitle" 等のキーを拾う防御的実装。
 */
export function extractFromNextData(doc: Document): NextDataResult | null {
  const script = doc.querySelector('#__NEXT_DATA__');
  if (!script?.textContent) return null;
  let data: unknown;
  try {
    data = JSON.parse(script.textContent);
  } catch {
    return null;
  }

  const result: NextDataResult = {};
  walk(data, (key, value) => {
    if (typeof value !== 'string') return;
    if (!result.title && /episodeTitle|^title$/i.test(key)) {
      result.title = normalizeLine(value);
    }
    if (!result.paragraphs && /bodyHtml|^body$/i.test(key) && value.includes('<')) {
      result.paragraphs = htmlToParagraphs(value);
    }
  });
  return result.title || result.paragraphs ? result : null;
}

function walk(node: unknown, visit: (key: string, value: unknown) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      visit(k, v);
      walk(v, visit);
    }
  }
}

function htmlToParagraphs(html: string): string[] {
  return html
    .replace(/<rt>[\s\S]*?<\/rt>/gi, '')
    .replace(/<rp>[\s\S]*?<\/rp>/gi, '')
    .split(/<\/p>|<br\s*\/?>/i)
    .map((chunk) => normalizeLine(chunk.replace(/<[^>]+>/g, '')))
    .filter((t) => t.length > 0);
}
