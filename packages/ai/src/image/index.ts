import type { Env } from "@novel-theater/config";
import type { ImageProvider } from "@novel-theater/types";
import { DummyImageProvider } from "./dummy";
import { FalImageProvider } from "./fal";

export { DummyImageProvider } from "./dummy";
export { FalImageProvider } from "./fal";

/**
 * env から画像プロバイダを選択する（アダプタ §7.9）。
 * 要件（キー未設定・未対応プロバイダ）を満たさない場合は dummy に安全フォールバック。
 */
export function createImageProvider(env: Env): ImageProvider {
  if (env.IMAGE_PROVIDER === "fal" && env.FAL_KEY) {
    return new FalImageProvider(env.FAL_KEY);
  }
  // replicate 等は将来ここに追加する。
  return new DummyImageProvider();
}
