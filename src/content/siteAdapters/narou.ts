// 小説家になろう (ncode.syosetu.com) 用アダプタ。
// 本文は概ね静的 HTML として初期ロード時に DOM に存在する。
import type { SiteAdapter } from './SiteAdapter';
import type { ChapterRef, ExtractedChapter } from '@/shared/types';
import { buildChapter, extractParagraphs, queryFirst, textWithoutRuby } from './utils/dom';

// 新レイアウト → 旧レイアウトの順に試すセレクタ優先リスト。
const BODY_SELECTORS = [
  '.p-novel__body',
  '.js-novel-text',
  '#novel_honbun',
  '#novel_color .novel_view',
];
const TITLE_SELECTORS = ['.p-novel__title', '.novel_subtitle', 'h1.p-novel__title'];

export const narouAdapter: SiteAdapter = {
  site: 'narou',

  matches(loc) {
    return /(^|\.)syosetu\.com$/.test(loc.hostname);
  },

  getChapterRef(loc) {
    // パス形: /<ncode>/<chapter>/  または 単一話 /<ncode>/
    const m = loc.pathname.match(/^\/(n[0-9a-z]+)\/(\d+)?/i);
    if (!m) return null;
    return {
      site: 'narou',
      workId: m[1].toLowerCase(),
      chapterId: m[2] ?? 'single',
      url: loc.href,
    };
  },

  async extract(doc, loc) {
    const ref = this.getChapterRef(loc);
    if (!ref) throw new Error('なろうの本文ページではありません');

    const titleEl = queryFirst(doc, TITLE_SELECTORS);
    const title = titleEl ? textWithoutRuby(titleEl).trim() : doc.title;

    const bodyEl = queryFirst(doc, BODY_SELECTORS);
    if (!bodyEl) throw new Error('なろうの本文要素が見つかりませんでした');

    const paragraphs = extractParagraphs(bodyEl);
    const built = buildChapter(paragraphs);
    const chapter: ExtractedChapter = { ref, title, ...built };
    return chapter;
  },
};

export type { ChapterRef };
