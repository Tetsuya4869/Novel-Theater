import { describe, it, expect } from "vitest";
import { normalizeText } from "@novel-theater/core";
import { HeuristicSegmenter } from "./segment/heuristic";
import { TemplatePromptBuilder } from "./prompt/template";
import { DummyImageProvider } from "./image/dummy";
import { computeLLMCostUSD } from "./cost";
import { generateWork } from "./pipeline";
import { LocalStorage } from "@novel-theater/storage";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SAMPLE = "夜の駅前。\n\nミナがカイに気づいて駆け寄った。\n\n二人は黙って歩き出した。";

describe("HeuristicSegmenter", () => {
  it("オフセットが正規化後テキストに対応する", async () => {
    const text = normalizeText(SAMPLE);
    const scenes = await new HeuristicSegmenter().segment(text);
    expect(scenes.length).toBe(3);
    for (const s of scenes) {
      expect(s.sourceStart).toBeLessThan(s.sourceEnd);
      expect(text.slice(s.sourceStart, s.sourceEnd).length).toBeGreaterThan(0);
    }
  });

  it("maxScenes でシーン数を上限に収める", async () => {
    const text = normalizeText(SAMPLE);
    const scenes = await new HeuristicSegmenter().segment(text, { maxScenes: 2 });
    expect(scenes.length).toBeLessThanOrEqual(2);
  });
});

describe("computeLLMCostUSD", () => {
  it("入出力トークンから USD を計算する", () => {
    const cost = computeLLMCostUSD("claude-opus-4-8", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(cost).toBeCloseTo(30, 5); // $5 in + $25 out
  });
});

describe("generateWork (offline pipeline)", () => {
  it("テキスト → シーン → コマ絵を生成し各シーンに asset が付く", async () => {
    const storage = new LocalStorage({
      baseDir: join(tmpdir(), `nt-test-${Date.now()}`),
      publicBaseUrl: "/generated",
    });
    const { work, metrics } = await generateWork(
      SAMPLE,
      { title: "テスト", maxScenes: 3, maxImages: 3 },
      {
        segmenter: new HeuristicSegmenter(),
        promptBuilder: new TemplatePromptBuilder(),
        imageProvider: new DummyImageProvider(),
        storage,
      },
    );
    expect(work.scenes.length).toBe(3);
    expect(metrics.imagesGenerated).toBe(3);
    expect(metrics.imagesFailed).toBe(0);
    const first = work.scenes[0]!;
    expect(first.status).toBe("image_ready");
    expect(first.assets[0]!.storageUrl).toMatch(/^\/generated\//);
  });
});
