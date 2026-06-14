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
  refresh: () => Promise<void>;
  setJob: (job: JobState) => void;
  addImage: (img: PanelImage) => void;
}

export const useStore = create<SidePanelState>((set) => ({
  chapter: null,
  job: null,
  analysis: null,
  images: {},
  loading: false,
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
}));
