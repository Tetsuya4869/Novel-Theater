import { describe, it, expect, vi, afterEach } from 'vitest';
import { createClaudeProvider } from '@/background/api/llm/claude';
import { createOpenAIProvider } from '@/background/api/image/openai';
import { ConcurrencyLimiter, withRetry } from '@/background/pipeline/rateLimiter';

const validAnalysis = {
  styleGuide: 'アニメ調',
  characters: [],
  panels: [{ index: 0, sceneDescription: 'd', imagePrompt: 'p', characterRefs: [] }],
};

const promptInput = {
  title: 't',
  text: '本文',
  styleDefault: 'アニメ調',
  panelMin: 4,
  panelMax: 8,
};

afterEach(() => vi.restoreAllMocks());

describe('createClaudeProvider', () => {
  it('sends a well-formed request and parses SceneAnalysis', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('claude-test');
      expect(body.messages[0].role).toBe('user');
      expect((init.headers as Record<string, string>)['x-api-key']).toBe('key123');
      return new Response(
        JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(validAnalysis) }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createClaudeProvider({ apiKey: 'key123', model: 'claude-test' });
    const result = await provider.analyze({ prompt: promptInput });
    expect(result.panels).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws a useful error on non-200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 429 })),
    );
    const provider = createClaudeProvider({ apiKey: 'k', model: 'm' });
    await expect(provider.analyze({ prompt: promptInput })).rejects.toThrow(/429/);
  });
});

describe('createOpenAIProvider', () => {
  it('decodes b64_json into a Blob', async () => {
    const b64 = btoa('PNGDATA');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), { status: 200 })),
    );
    const provider = createOpenAIProvider({ apiKey: 'k', model: 'gpt-image-1' });
    const { blob, mime } = await provider.generate({ prompt: 'p', size: '1024x1024' });
    expect(mime).toBe('image/png');
    expect(await blob.text()).toBe('PNGDATA');
  });

  it('declares no seed / reference support', () => {
    const provider = createOpenAIProvider({ apiKey: 'k', model: 'gpt-image-1' });
    expect(provider.capabilities.supportsSeed).toBe(false);
    expect(provider.capabilities.supportsReferenceImage).toBe(false);
  });
});

describe('rateLimiter', () => {
  it('caps concurrency', async () => {
    const limiter = new ConcurrencyLimiter(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      limiter.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
      });
    await Promise.all([task(), task(), task(), task(), task()]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('retries 429 then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) throw Object.assign(new Error('rate'), { status: 429 });
        return 'ok';
      },
      { retries: 3, baseMs: 1 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('does not retry a 400', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw Object.assign(new Error('bad'), { status: 400 });
        },
        { retries: 3, baseMs: 1 },
      ),
    ).rejects.toThrow('bad');
    expect(calls).toBe(1);
  });
});
