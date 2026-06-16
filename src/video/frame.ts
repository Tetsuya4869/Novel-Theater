// 1 コマ分のフレーム描画。TheaterView の実時間再生と動画書き出しで共有する。
import { directionFor, kenBurnsRect } from './kenBurns';
import { drawSubtitle } from './subtitles';

export interface FramePanel {
  index: number;
  image: CanvasImageSource & { width: number; height: number };
  subtitle: string;
}

/** 画像を canvas いっぱいに cover 配置しつつ Ken Burns と字幕を描く。 */
export function renderPanelFrame(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  panel: FramePanel,
  progress: number,
): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const { image } = panel;
  const rect = kenBurnsRect(image.width, image.height, progress, directionFor(panel.index));

  // cover: 画像のアスペクト比を保ったまま canvas を覆う。
  const imgAspect = rect.sw / rect.sh;
  const canvasAspect = canvasW / canvasH;
  let dw = canvasW;
  let dh = canvasH;
  let sx = rect.sx;
  let sy = rect.sy;
  let sw = rect.sw;
  let sh = rect.sh;
  if (imgAspect > canvasAspect) {
    // 画像が横長 → 横を切る
    const targetSw = rect.sh * canvasAspect;
    sx = rect.sx + (rect.sw - targetSw) / 2;
    sw = targetSw;
  } else {
    const targetSh = rect.sw / canvasAspect;
    sy = rect.sy + (rect.sh - targetSh) / 2;
    sh = targetSh;
  }

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh);
  drawSubtitle(ctx, panel.subtitle, canvasW, canvasH);
}

/** dataURL から HTMLImageElement を読み込む。 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = src;
  });
}
