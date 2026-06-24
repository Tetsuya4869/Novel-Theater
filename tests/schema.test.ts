import { describe, it, expect } from 'vitest';
import { parseSceneAnalysis, sceneAnalysisSchema } from '@/shared/schema';

describe('parseSceneAnalysis', () => {
  const valid = {
    styleGuide: 'アニメ調、淡い水彩',
    characters: [{ id: 'char_a', name: 'アオイ', appearance: '黒髪ロング、制服' }],
    panels: [
      {
        index: 0,
        caption: '朝の教室',
        characterRefs: ['char_a'],
        sceneDescription: '窓際の席に座る少女',
        imagePrompt: 'アニメ調、淡い水彩、黒髪ロングの少女が窓際に座る',
        styleHints: 'アニメ調',
      },
    ],
  };

  it('parses a clean JSON object', () => {
    const r = parseSceneAnalysis(JSON.stringify(valid));
    expect(r.panels).toHaveLength(1);
    expect(r.characters[0].id).toBe('char_a');
  });

  it('parses JSON wrapped in a ```json code fence with prose around it', () => {
    const raw = `以下が結果です。\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\`\nご確認ください。`;
    const r = parseSceneAnalysis(raw);
    expect(r.styleGuide).toContain('アニメ調');
  });

  it('applies defaults for optional fields', () => {
    const r = sceneAnalysisSchema.parse({
      styleGuide: 's',
      panels: [{ index: 0, sceneDescription: 'd', imagePrompt: 'p' }],
    });
    expect(r.characters).toEqual([]);
    expect(r.panels[0].characterRefs).toEqual([]);
    expect(r.panels[0].styleHints).toBe('');
  });

  it('rejects an object with no panels', () => {
    expect(() => sceneAnalysisSchema.parse({ styleGuide: 's', panels: [] })).toThrow();
  });
});
