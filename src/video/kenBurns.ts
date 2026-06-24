// Ken Burns 効果: 進行度に応じて画像のソース矩形を動かし、パン＋ズームを生む。

export type KenBurnsDirection = 'in' | 'out' | 'left' | 'right' | 'up' | 'down';

export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const DIRECTIONS: KenBurnsDirection[] = ['in', 'out', 'left', 'right', 'up', 'down'];

/** コマ index から決定的に方向を選ぶ（再現性のため）。 */
export function directionFor(index: number): KenBurnsDirection {
  return DIRECTIONS[index % DIRECTIONS.length];
}

/** ease-in-out。 */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * 画像サイズと進行度(0..1)から描画元の矩形を計算する。
 * zoom 1.0 で全体、maxZoom で最大ズーム。
 */
export function kenBurnsRect(
  imgW: number,
  imgH: number,
  progress: number,
  direction: KenBurnsDirection,
  maxZoom = 1.18,
): SourceRect {
  const t = easeInOut(Math.min(1, Math.max(0, progress)));

  // ズーム量。in は寄っていく、out は引いていく。
  let zoom: number;
  if (direction === 'out') zoom = maxZoom - (maxZoom - 1) * t;
  else if (direction === 'in') zoom = 1 + (maxZoom - 1) * t;
  else zoom = (1 + maxZoom) / 2; // パン系は一定ズーム

  const sw = imgW / zoom;
  const sh = imgH / zoom;

  // パン: 余白の範囲内で平行移動。
  const freeX = imgW - sw;
  const freeY = imgH - sh;
  let fx = 0.5;
  let fy = 0.5;
  if (direction === 'left') fx = 1 - t;
  else if (direction === 'right') fx = t;
  else if (direction === 'up') fy = 1 - t;
  else if (direction === 'down') fy = t;

  return {
    sx: freeX * fx,
    sy: freeY * fy,
    sw,
    sh,
  };
}
