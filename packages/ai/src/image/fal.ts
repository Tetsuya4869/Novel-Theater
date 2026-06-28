import type { ImageGenerateInput, ImageGenerateResult, ImageProvider } from "@novel-theater/types";

/**
 * 集約プロバイダ（fal）経由の本番候補（§7.5）。
 * MVP 方針: まずマネージドで価値検証 → 一貫性が肝と判明したら投資。
 * モデル/エンドポイントは時期で変動するため、ここはアダプタとして差し替え可能にしておく。
 *
 * 注: Phase 0 既定は dummy。FAL_KEY が設定され IMAGE_PROVIDER=fal のときのみ使用する。
 * 実際の fal モデル ID・レスポンス形は採用時に docs/eval.md で確定する。
 */
export class FalImageProvider implements ImageProvider {
  readonly id = "fal";
  constructor(
    private readonly apiKey: string,
    private readonly model = "fal-ai/flux/schnell",
  ) {}

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const started = Date.now();
    const res = await fetch(`https://fal.run/${this.model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: input.prompt,
        negative_prompt: input.negativePrompt,
        seed: input.seed,
        image_size: aspectToSize(input.aspectRatio),
      }),
    });
    if (!res.ok) {
      throw new Error(`fal リクエスト失敗: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { images?: Array<{ url?: string }>; seed?: number };
    const url = json.images?.[0]?.url;
    if (!url) throw new Error("fal レスポンスに画像 URL がありません");

    const img = await fetch(url);
    const data = new Uint8Array(await img.arrayBuffer());
    return {
      data,
      contentType: img.headers.get("content-type") ?? "image/jpeg",
      cost: 0, // 実単価はプロバイダ確定後に設定（§7.11）
      latencyMs: Date.now() - started,
      seed: json.seed ?? input.seed ?? 0,
    };
  }
}

function aspectToSize(aspect: string): string {
  switch (aspect) {
    case "16:9":
      return "landscape_16_9";
    case "2:3":
      return "portrait_4_3";
    case "1:1":
      return "square";
    default:
      return "landscape_4_3";
  }
}
