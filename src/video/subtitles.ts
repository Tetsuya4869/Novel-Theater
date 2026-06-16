// 字幕描画。日本語は単語境界が無いため文字単位で折り返す。

/** ctx の現在フォントで maxWidth に収まるよう文字単位で行へ分割する。 */
export function wrapTextByMeasure(
  ctx: Pick<CanvasRenderingContext2D, 'measureText'>,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    const candidate = line + ch;
    if (ctx.measureText(candidate).width > maxWidth && line !== '') {
      lines.push(line);
      line = ch;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface SubtitleStyle {
  fontPx: number;
  paddingX: number;
  paddingY: number;
  lineGap: number;
  maxLines: number;
}

export function defaultSubtitleStyle(canvasW: number): SubtitleStyle {
  const fontPx = Math.round(canvasW * 0.038);
  return { fontPx, paddingX: fontPx, paddingY: fontPx * 0.6, lineGap: fontPx * 0.4, maxLines: 4 };
}

/** キャンバス下部に字幕プレート＋テキストを描画する。 */
export function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasW: number,
  canvasH: number,
  style: SubtitleStyle = defaultSubtitleStyle(canvasW),
): void {
  if (!text.trim()) return;
  ctx.font = `600 ${style.fontPx}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';

  const maxTextWidth = canvasW - style.paddingX * 2;
  let lines = wrapTextByMeasure(ctx, text, maxTextWidth);
  if (lines.length > style.maxLines) {
    lines = lines.slice(0, style.maxLines);
    lines[lines.length - 1] = lines[lines.length - 1].replace(/.$/, '…');
  }

  const lineH = style.fontPx + style.lineGap;
  const plateH = lines.length * lineH + style.paddingY * 2;
  const plateY = canvasH - plateH;

  // 半透明プレート
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, plateY, canvasW, plateH);

  // テキスト（縁取り + 白）
  ctx.lineWidth = Math.max(2, style.fontPx * 0.08);
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.fillStyle = '#fff';
  let y = plateY + style.paddingY;
  for (const ln of lines) {
    const w = ctx.measureText(ln).width;
    const x = (canvasW - w) / 2;
    ctx.strokeText(ln, x, y);
    ctx.fillText(ln, x, y);
    y += lineH;
  }
}

/** コマの字幕テキスト（caption + セリフ）を組み立てる。 */
export function panelSubtitle(caption?: string, dialogue?: { text: string }[]): string {
  const parts: string[] = [];
  if (caption) parts.push(caption);
  if (dialogue?.length) parts.push(dialogue.map((d) => `「${d.text}」`).join(''));
  return parts.join('\n');
}
