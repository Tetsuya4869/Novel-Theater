import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { renderPanelFrame, loadImage, type FramePanel } from '@/video/frame';
import { panelSubtitle } from '@/video/subtitles';
import { exportVideo, downloadBlob } from '@/video/assembler';
import { cancelSpeech, speak, ttsAvailable } from '@/video/tts';

const SECONDS_PER_PANEL = 3.5;
const CANVAS = 1024;

interface Props {
  onClose: () => void;
}

interface Slide {
  index: number;
  imageUrl: string;
  subtitle: string;
}

export function TheaterView({ onClose }: Props) {
  const { chapter, analysis, images } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<FramePanel[]>([]);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [cur, setCur] = useState(0);
  const [tts, setTts] = useState(false);
  const [exporting, setExporting] = useState<number | null>(null);

  // 画像つきコマだけを対象にする。
  const slides: Slide[] = (analysis?.panels ?? [])
    .filter((p) => images[p.index])
    .map((p) => ({
      index: p.index,
      imageUrl: images[p.index],
      subtitle: panelSubtitle(p.caption, p.dialogue),
    }));

  // 画像をプリロード。
  useEffect(() => {
    let alive = true;
    (async () => {
      const loaded: FramePanel[] = [];
      for (const s of slides) {
        const image = await loadImage(s.imageUrl);
        loaded.push({ index: s.index, image, subtitle: s.subtitle });
      }
      if (alive) {
        framesRef.current = loaded;
        setReady(true);
      }
    })();
    return () => {
      alive = false;
      cancelSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, Object.keys(images).length]);

  // 再生ループ（rAF で進行度を更新しつつ描画）。
  useEffect(() => {
    if (!ready || !playing || slides.length === 0) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let start = performance.now();
    let index = cur;
    if (tts && framesRef.current[index]) void speak(framesRef.current[index].subtitle);

    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const progress = Math.min(1, elapsed / SECONDS_PER_PANEL);
      const frame = framesRef.current[index];
      if (frame) renderPanelFrame(ctx, CANVAS, CANVAS, frame, progress);
      if (progress >= 1) {
        index += 1;
        if (index >= framesRef.current.length) {
          setPlaying(false);
          setCur(framesRef.current.length - 1);
          return;
        }
        setCur(index);
        start = now;
        if (tts) void speak(framesRef.current[index].subtitle);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      cancelSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playing, tts]);

  // 一時停止中も現在コマを静止描画。
  useEffect(() => {
    if (playing) return;
    const ctx = canvasRef.current?.getContext('2d');
    const frame = framesRef.current[cur];
    if (ctx && frame) renderPanelFrame(ctx, CANVAS, CANVAS, frame, 1);
  }, [playing, cur, ready]);

  const go = (delta: number) => {
    const next = Math.max(0, Math.min(slides.length - 1, cur + delta));
    setPlaying(false);
    setCur(next);
  };

  const doExport = async () => {
    setExporting(0);
    try {
      const blob = await exportVideo({
        panels: slides,
        width: CANVAS,
        height: CANVAS,
        secondsPerPanel: SECONDS_PER_PANEL,
        onProgress: (done, total) => setExporting(Math.round((done / total) * 100)),
      });
      const name = `novel-theater-${chapter?.ref.workId ?? 'video'}-${chapter?.ref.chapterId ?? ''}.webm`;
      downloadBlob(blob, name);
    } catch (e) {
      alert('動画の書き出しに失敗しました: ' + (e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="theater">
      <div className="theater-top">
        <span>
          紙芝居 {slides.length > 0 ? `${cur + 1}/${slides.length}` : ''}
        </span>
        <button className="ghost small" onClick={onClose}>
          ✕ 閉じる
        </button>
      </div>

      <div className="theater-stage">
        {slides.length === 0 ? (
          <div className="empty">表示できるコマ絵がまだありません。</div>
        ) : (
          <canvas ref={canvasRef} width={CANVAS} height={CANVAS} className="theater-canvas" />
        )}
      </div>

      <div className="theater-controls">
        <button className="ghost" onClick={() => go(-1)} disabled={cur === 0}>
          ⏮
        </button>
        <button className="primary" onClick={() => setPlaying((p) => !p)} disabled={slides.length === 0}>
          {playing ? '⏸ 一時停止' : '▶ 再生'}
        </button>
        <button className="ghost" onClick={() => go(1)} disabled={cur >= slides.length - 1}>
          ⏭
        </button>
        {ttsAvailable() && (
          <label className="tts-toggle">
            <input type="checkbox" checked={tts} onChange={(e) => setTts(e.target.checked)} />
            ナレーション
          </label>
        )}
        <button
          className="ghost"
          onClick={doExport}
          disabled={slides.length === 0 || exporting !== null}
        >
          {exporting !== null ? `書き出し中… ${exporting}%` : '⬇ 動画を保存'}
        </button>
      </div>
    </div>
  );
}
