// 設定から画像プロバイダを生成するファクトリ。
import type { Settings } from '@/shared/types';
import type { ImageProvider } from './ImageProvider';
import { createOpenAIProvider } from './openai';
import { createImagenProvider } from './imagen';
import { createStabilityProvider } from './stability';

export function createImageProvider(s: Settings): ImageProvider {
  const { provider, model, apiKey } = s.image;
  if (!apiKey) throw new Error('画像生成の API キーが未設定です。設定画面で入力してください。');
  switch (provider) {
    case 'openai':
      return createOpenAIProvider({ apiKey, model });
    case 'imagen':
      return createImagenProvider({ apiKey, model });
    case 'stability':
      return createStabilityProvider({ apiKey, model });
    default:
      throw new Error(`未知の画像プロバイダ: ${provider}`);
  }
}

export type { ImageProvider };
