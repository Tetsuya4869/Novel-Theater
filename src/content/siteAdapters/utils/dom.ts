// 抽出用 DOM ユーティリティ。テスト容易性のため Document を引数で受け取る純関数群。

/** セレクタ優先リストから最初にマッチした要素を返す。 */
export function queryFirst(doc: ParentNode, selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * ルビを基底テキストへ展開しつつ要素のテキストを取得する。
 * <ruby>漢字<rt>かんじ</rt></ruby> → "漢字"（rt を除去）。
 */
export function textWithoutRuby(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('rt, rp').forEach((n) => n.remove());
  return clone.textContent ?? '';
}

/** 本文コンテナから段落配列を抽出する。 */
export function extractParagraphs(container: Element): string[] {
  // <p> があればそれを段落単位とする。なければ改行で分割。
  const ps = Array.from(container.querySelectorAll('p'));
  if (ps.length > 0) {
    return ps
      .map((p) => normalizeLine(textWithoutRuby(p)))
      .filter((t) => t.length > 0);
  }
  const text = textWithoutRuby(container);
  return text
    .split(/\n+/)
    .map(normalizeLine)
    .filter((t) => t.length > 0);
}

export function normalizeLine(s: string): string {
  return s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
}

export function buildChapter(
  paragraphs: string[],
): { paragraphs: string[]; rawText: string; charCount: number } {
  const cleaned = paragraphs.filter((p) => p.length > 0);
  const rawText = cleaned.join('\n');
  return { paragraphs: cleaned, rawText, charCount: rawText.length };
}

/**
 * extractParagraphs と同じフィルタ（非空 <p>）で段落要素を返す。
 * 抽出した paragraphs 配列とインデックスが一致するため、読書位置同期に使える。
 * <p> が無いレイアウトでは空配列を返す（同期は無効）。
 */
export function paragraphElements(container: Element): Element[] {
  return Array.from(container.querySelectorAll('p')).filter(
    (p) => normalizeLine(textWithoutRuby(p)).length > 0,
  );
}

/**
 * セレクタに要素が現れるまで待つ（カクヨムの hydration 対策）。
 * ブラウザ専用（MutationObserver）。テストでは直接 extract に hydration 済み
 * Document を渡すため呼ばれない。
 */
export function waitForSelector(
  doc: Document,
  selector: string,
  timeoutMs = 5000,
): Promise<Element | null> {
  const existing = doc.querySelector(selector);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(doc.querySelector(selector));
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      const el = doc.querySelector(selector);
      if (el) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
  });
}
