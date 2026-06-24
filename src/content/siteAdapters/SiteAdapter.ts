// サイトごとの本文抽出契約。なろう / カクヨムアダプタがこれを実装する。
import type { ChapterRef, ExtractedChapter, SiteId } from '@/shared/types';

export interface SiteAdapter {
  readonly site: SiteId;

  /** 高速な URL / ホスト判定。 */
  matches(loc: Location): boolean;

  /** 現在 URL から章参照を得る。本文ページでなければ null。 */
  getChapterRef(loc: Location): ChapterRef | null;

  /**
   * 本文を抽出する。カクヨムは hydration を待つ可能性があるため async。
   * @param doc 対象ドキュメント（テスト時は jsdom/linkedom の Document）
   */
  extract(doc: Document, loc: Location): Promise<ExtractedChapter>;

  /**
   * 本文コンテナ要素を返す（読書位置同期用）。hydration 待ちを含むため async。
   * 取得できなければ null。
   */
  getBodyElement(doc: Document): Promise<Element | null>;
}
