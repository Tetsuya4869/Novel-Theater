// Google Imagen (Generative Language API predict エンドポイント)。
import type { GenerateImageInput, GeneratedImage, ImageProvider } from './ImageProvider';
import { ImageError, base64ToBlob } from './ImageProvider';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface ImagenConfig {
  apiKey: string;
  model: string;
}

// Imagen は明示サイズ指定の代わりにアスペクト比を取る。
function sizeToAspect(size: string): string {
  const [w, h] = size.split('x').map(Number);
  if (!w || !h) return '1:1';
  if (w === h) return '1:1';
  return w > h ? '16:9' : '9:16';
}

export function createImagenProvider(cfg: ImagenConfig): ImageProvider {
  return {
    id: 'imagen',
    capabilities: {
      sizes: ['1024x1024', '1024x1536', '1536x1024'],
      supportsSeed: false,
      supportsReferenceImage: false,
    },
    async generate(input: GenerateImageInput): Promise<GeneratedImage> {
      const url = `${BASE}/${encodeURIComponent(cfg.model)}:predict?key=${encodeURIComponent(cfg.apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        signal: input.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: input.prompt }],
          parameters: { sampleCount: 1, aspectRatio: sizeToAspect(input.size) },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new ImageError(`Imagen 生成エラー (${res.status}): ${body.slice(0, 300)}`, res.status);
      }
      const json = (await res.json()) as {
        predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
      };
      const pred = json.predictions?.[0];
      if (!pred?.bytesBase64Encoded) {
        throw new ImageError('Imagen 応答に画像データがありません');
      }
      const mime = pred.mimeType ?? 'image/png';
      return { blob: base64ToBlob(pred.bytesBase64Encoded, mime), mime };
    },
  };
}
