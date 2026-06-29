import type { VideoProvider } from "@novel-theater/types";

/**
 * 集約プロバイダ（fal）経由の image-to-video 本番候補（§7.6）。
 * コマ絵を起点に 2〜6 秒の短尺を生成する。モデル/エンドポイント・単価は
 * 採用時に docs/eval.md で確定する（地域可用性・規約も要確認）。
 *
 * 注: sourceImageUrl はプロバイダから到達可能な公開 URL である必要がある。
 * 開発時の LocalStorage の相対 URL では到達できないため、本番では S3 等の
 * 公開 URL を渡す（§6）。Phase 2 既定は dummy。
 */
export class FalVideoProvider implements VideoProvider {
  readonly id = "fal-video";
  constructor(
    private readonly apiKey: string,
    private readonly model = "fal-ai/kling-video/v1/standard/image-to-video",
    /** 単価（USD/clip）。プロバイダ確定後に設定。 */
    private readonly costPerClip = 0,
  ) {}

  async animate(input: {
    sourceImageUrl: string;
    motionPrompt: string;
    durationSec: number;
  }): Promise<{ data: Uint8Array; contentType: string; cost: number; latencyMs: number }> {
    const started = Date.now();
    const res = await fetch(`https://fal.run/${this.model}`, {
      method: "POST",
      headers: { Authorization: `Key ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: input.sourceImageUrl,
        prompt: input.motionPrompt,
        duration: String(Math.max(2, Math.min(6, input.durationSec || 4))),
      }),
    });
    if (!res.ok) throw new Error(`fal i2v リクエスト失敗: ${res.status} ${res.statusText}`);
    const json = (await res.json()) as { video?: { url?: string } };
    const url = json.video?.url;
    if (!url) throw new Error("fal レスポンスに動画 URL がありません");

    const clip = await fetch(url);
    const data = new Uint8Array(await clip.arrayBuffer());
    return {
      data,
      contentType: clip.headers.get("content-type") ?? "video/mp4",
      cost: this.costPerClip,
      latencyMs: Date.now() - started,
    };
  }
}
