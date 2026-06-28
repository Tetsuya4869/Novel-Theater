/** 正規化後テキスト内の段落スパン（オフセット保持）。 */
export interface ParagraphSpan {
  start: number;
  end: number;
  text: string;
}

/**
 * 空行区切りで段落に分割し、各段落の文字オフセット範囲を保持する（§8.3）。
 * 抜粋ではなくオフセットを返すのがスクロール同期を堅牢化する鍵。
 */
export function splitIntoParagraphs(text: string): ParagraphSpan[] {
  const raw: ParagraphSpan[] = [];
  const re = /\n[ \t]*\n+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) raw.push({ start: last, end: m.index, text: text.slice(last, m.index) });
    last = m.index + m[0].length;
  }
  if (last < text.length) raw.push({ start: last, end: text.length, text: text.slice(last) });

  // 各段落の前後空白を取り除きつつ、オフセットを実テキストに合わせて補正する。
  const trimmed: ParagraphSpan[] = [];
  for (const s of raw) {
    const leading = s.text.length - s.text.trimStart().length;
    const trailing = s.text.length - s.text.trimEnd().length;
    const start = s.start + leading;
    const end = s.end - trailing;
    if (end > start) trimmed.push({ start, end, text: text.slice(start, end) });
  }
  return trimmed;
}

/**
 * オフセットを含むシーンを二分探索し、該当シーンの index を返す（O(log n)）。
 * どのシーンにも該当しない場合は -1。scenes は sourceStart 昇順を前提とする。
 */
export function sceneIndexAtOffset(
  scenes: ReadonlyArray<{ sourceStart: number; sourceEnd: number }>,
  offset: number,
): number {
  let lo = 0;
  let hi = scenes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = scenes[mid]!;
    if (offset < s.sourceStart) hi = mid - 1;
    else if (offset >= s.sourceEnd) lo = mid + 1;
    else return mid;
  }
  return -1;
}
