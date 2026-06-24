// 画像生成プロバイダ抽象。プロンプト → 画像 blob。
export interface ImageCapabilities {
  sizes: string[];
  supportsSeed: boolean;
  supportsReferenceImage: boolean;
}

export interface GenerateImageInput {
  prompt: string;
  size: string;
  seed?: number;
  /** capabilities.supportsReferenceImage が true の場合のみ使用。 */
  referenceImage?: Blob;
  signal?: AbortSignal;
}

export interface GeneratedImage {
  blob: Blob;
  mime: string;
}

export interface ImageProvider {
  readonly id: 'openai' | 'imagen' | 'stability';
  readonly capabilities: ImageCapabilities;
  generate(input: GenerateImageInput): Promise<GeneratedImage>;
}

export class ImageError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ImageError';
  }
}

/** base64(データ無し) → Blob 変換ユーティリティ。 */
export function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
