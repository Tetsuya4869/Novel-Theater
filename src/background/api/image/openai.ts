// OpenAI Images API (gpt-image-1 / dall-e-3)。
import type { GenerateImageInput, GeneratedImage, ImageProvider } from './ImageProvider';
import { ImageError, base64ToBlob } from './ImageProvider';

const ENDPOINT = 'https://api.openai.com/v1/images/generations';

export interface OpenAIConfig {
  apiKey: string;
  model: string;
}

export function createOpenAIProvider(cfg: OpenAIConfig): ImageProvider {
  return {
    id: 'openai',
    capabilities: {
      sizes: ['1024x1024', '1024x1536', '1536x1024'],
      supportsSeed: false,
      supportsReferenceImage: false,
    },
    async generate(input: GenerateImageInput): Promise<GeneratedImage> {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        signal: input.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          prompt: input.prompt,
          size: input.size,
          n: 1,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new ImageError(`OpenAI 画像生成エラー (${res.status}): ${body.slice(0, 300)}`, res.status);
      }
      const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
      const item = json.data?.[0];
      if (item?.b64_json) {
        return { blob: base64ToBlob(item.b64_json, 'image/png'), mime: 'image/png' };
      }
      if (item?.url) {
        const img = await fetch(item.url, { signal: input.signal });
        const blob = await img.blob();
        return { blob, mime: blob.type || 'image/png' };
      }
      throw new ImageError('OpenAI 応答に画像データがありません');
    },
  };
}
