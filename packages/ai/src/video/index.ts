import type { Env } from "@novel-theater/config";
import type { VideoProvider } from "@novel-theater/types";
import { DummyVideoProvider } from "./dummy";
import { FalVideoProvider } from "./fal";

export { DummyVideoProvider } from "./dummy";
export { FalVideoProvider } from "./fal";

/** env から動画プロバイダを選択する（アダプタ §7.9）。未対応時は dummy へ安全フォールバック。 */
export function createVideoProvider(env: Env): VideoProvider {
  if (env.VIDEO_PROVIDER === "fal" && env.FAL_KEY) {
    return new FalVideoProvider(env.FAL_KEY);
  }
  return new DummyVideoProvider();
}
