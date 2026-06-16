import { describe, it, expect } from 'vitest';
import { panelForParagraph } from '@/sidepanel/store';
import type { SceneAnalysis } from '@/shared/types';

const analysis: SceneAnalysis = {
  styleGuide: 's',
  characters: [],
  panels: [
    { index: 0, characterRefs: [], sceneDescription: 'a', imagePrompt: 'a', styleHints: '', sourceParagraphs: [0, 2] },
    { index: 1, characterRefs: [], sceneDescription: 'b', imagePrompt: 'b', styleHints: '', sourceParagraphs: [3, 5] },
    { index: 2, characterRefs: [], sceneDescription: 'c', imagePrompt: 'c', styleHints: '' },
  ],
};

describe('panelForParagraph', () => {
  it('maps a paragraph to the panel whose range contains it', () => {
    expect(panelForParagraph(analysis, 0)).toBe(0);
    expect(panelForParagraph(analysis, 2)).toBe(0);
    expect(panelForParagraph(analysis, 3)).toBe(1);
    expect(panelForParagraph(analysis, 5)).toBe(1);
  });

  it('returns null for paragraphs outside any range', () => {
    expect(panelForParagraph(analysis, 99)).toBeNull();
  });

  it('ignores panels without sourceParagraphs', () => {
    expect(panelForParagraph(analysis, 6)).toBeNull();
  });

  it('returns null on missing inputs', () => {
    expect(panelForParagraph(null, 0)).toBeNull();
    expect(panelForParagraph(analysis, null)).toBeNull();
  });
});
