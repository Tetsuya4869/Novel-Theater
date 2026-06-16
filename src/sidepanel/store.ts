// サイドパネルの状態管理 (Zustand)。
import { create } from 'zustand';
import type { ExtractedChapter, JobState, SceneAnalysis } from '@/shared/types';
import { sendRpc } from '@/shared/messaging';

interface PanelImage {
  index: number;
  dataUrl: string;
}

interface SidePanelState {
  chapter: ExtractedChapter | null;
  job: JobState | null;
  analysis: SceneAnalysis | null;
  images: Record<number, string>;
  loading: boolean;
  /** 本文側で現在読んでいる段落インデックス（読書位置同期）。 */
  visibleParagraph: number | null;
  refresh: () => Promise<void>;
  setJob: (job: JobState) => void;
  addImage: (img: PanelImage) => void;
  setVisibleParagraph: (paragraph: number) => void;
}

export const useStore = create<SidePanelState>((set) => ({
  chapter: null,
  job: null,
  analysis: null,
  images: {},
  loading: false,
  visibleParagraph: null,
  refresh: async () => {
    set({ loading: true });
    try {
      const { chapter, job, analysis } = await sendRpc('getActiveChapter', {});
      set({ chapter, job, analysis });
    } finally {
      set({ loading: false });
    }
  },
  setJob: (job) => set({ job }),
  addImage: (img) => set((s) => ({ images: { ...s.images, [img.index]: img.dataUrl } })),
  setVisibleParagraph: (paragraph) => set({ visibleParagraph: paragraph }),
}));

/** 段落インデックスに対応するコマを返す（sourceParagraphs 範囲）。 */
export function panelForParagraph(analysis: SceneAnalysis | null, paragraph: number | null): number | null {
  if (!analysis || paragraph == null) return null;
  for (const p of analysis.panels) {
    if (p.sourceParagraphs) {
      const [start, end] = p.sourceParagraphs;
      if (paragraph >= start && paragraph <= end) return p.index;
    }
  }
  return null;
}
