// Stability AI (Stable Image Generate, SD3.5 系)。seed と画風調整に強い。
import type { GenerateImageInput, GeneratedImage, ImageProvider } from './ImageProvider';
import { ImageError } from './ImageProvider';

const ENDPOINT = 'https://api.stability.ai/v2beta/stable-image/generate/sd3';

export interface StabilityConfig {
  apiKey: string;
  model: string;
}

function sizeToAspect(size: string): string {
  const [w, h] = size.split('x').map(Number);
  if (!w || !h || w === h) return '1:1';
  return w > h ? '3:2' : '2:3';
}

export function createStabilityProvider(cfg: StabilityConfig): ImageProvider {
  return {
    id: 'stability',
    capabilities: {
      sizes: ['1024x1024', '1024x1536', '1536x1024'],
      supportsSeed: true,
      supportsReferenceImage: true,
    },
    async generate(input: GenerateImageInput): Promise<GeneratedImage> {
      const form = new FormData();
      form.append('prompt', input.prompt);
      form.append('model', cfg.model);
      form.append('aspect_ratio', sizeToAspect(input.size));
      form.append('output_format', 'png');
      if (input.seed != null) form.append('seed', String(input.seed));
      if (input.referenceImage) {
        // image-to-image: 参照画像でキャラ一貫性を補強。
        form.append('image', input.referenceImage, 'reference.png');
        form.append('strength', '0.65');
        form.append('mode', 'image-to-image');
      }
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        signal: input.signal,
        headers: {
          authorization: `Bearer ${cfg.apiKey}`,
          accept: 'image/*',
        },
        body: form,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new ImageError(`Stability 生成エラー (${res.status}): ${body.slice(0, 300)}`, res.status);
      }
      const blob = await res.blob();
      return { blob, mime: blob.type || 'image/png' };
    },
  };
}
