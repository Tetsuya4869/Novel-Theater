import { describe, it, expect } from 'vitest';
import { directionFor, easeInOut, kenBurnsRect } from '@/video/kenBurns';
import { panelSubtitle, wrapTextByMeasure } from '@/video/subtitles';

describe('kenBurns', () => {
  it('easeInOut is clamped to [0,1] endpoints', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
  });

  it('directionFor is deterministic and cycles', () => {
    expect(directionFor(0)).toBe(directionFor(6));
    expect(directionFor(1)).not.toBe(directionFor(0));
  });

  it('source rect stays within image bounds', () => {
    for (const dir of ['in', 'out', 'left', 'right', 'up', 'down'] as const) {
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        const r = kenBurnsRect(1000, 800, p, dir);
        expect(r.sx).toBeGreaterThanOrEqual(-0.001);
        expect(r.sy).toBeGreaterThanOrEqual(-0.001);
        expect(r.sx + r.sw).toBeLessThanOrEqual(1000.001);
        expect(r.sy + r.sh).toBeLessThanOrEqual(800.001);
      }
    }
  });

  it('zoom shrinks the source rect below full size', () => {
    const r = kenBurnsRect(1000, 1000, 1, 'in');
    expect(r.sw).toBeLessThan(1000);
  });
});

describe('subtitles', () => {
  // 各文字を幅 10 とみなす疑似 ctx。
  const ctx = { measureText: (t: string) => ({ width: t.length * 10 }) } as Pick<
    CanvasRenderingContext2D,
    'measureText'
  >;

  it('wraps Japanese text by character to fit maxWidth', () => {
    const lines = wrapTextByMeasure(ctx, 'あいうえおかきくけこ', 35); // 3 文字/行
    expect(lines).toEqual(['あいう', 'えおか', 'きくけ', 'こ']);
  });

  it('honors explicit newlines', () => {
    expect(wrapTextByMeasure(ctx, 'ab\ncd', 1000)).toEqual(['ab', 'cd']);
  });

  it('panelSubtitle combines caption and dialogue', () => {
    expect(panelSubtitle('朝の教室', [{ text: 'おはよう' }])).toBe('朝の教室\n「おはよう」');
    expect(panelSubtitle('地の文のみ')).toBe('地の文のみ');
    expect(panelSubtitle(undefined, [{ text: 'やあ' }])).toBe('「やあ」');
  });
});
