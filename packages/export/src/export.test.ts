import { describe, it, expect } from "vitest";
import type { Work } from "@novel-theater/types";
import { renderWorkHtml } from "./index";

const work: Work = {
  id: "w1",
  title: "テスト<作品>",
  sourceText: "一行目\n\n二行目",
  language: "ja",
  visibility: "public",
  contentHash: "h",
  settings: { style: "manga", panelDensity: "medium", videoLevel: "none", narration: false },
  scenes: [
    {
      id: "s0",
      workId: "w1",
      orderIndex: 0,
      sourceStart: 0,
      sourceEnd: 3,
      summary: "要約",
      imagePrompt: "p",
      directingNotes: {},
      panelPriority: 1,
      videoCandidate: false,
      status: "image_ready",
      assets: [
        {
          id: "a0",
          sceneId: "s0",
          kind: "image",
          storageUrl: "/generated/w1/s0.svg",
          providerId: "dummy",
          contentHash: "ph",
          status: "ready",
          meta: {},
        },
      ],
    },
  ],
};

describe("renderWorkHtml", () => {
  it("タイトル/本文/コマ絵を含む HTML を生成し、HTML をエスケープする", () => {
    const html = renderWorkHtml(work);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("テスト&lt;作品&gt;"); // エスケープ済み
    expect(html).toContain('src="/generated/w1/s0.svg"');
    expect(html).toContain("一行目");
  });

  it("baseUrl で相対 URL を絶対化する", () => {
    const html = renderWorkHtml(work, { baseUrl: "https://x.example" });
    expect(html).toContain('src="https://x.example/generated/w1/s0.svg"');
  });

  it("未生成コマはプレースホルダ表示", () => {
    const w2: Work = { ...work, scenes: [{ ...work.scenes[0]!, assets: [], status: "captioned" }] };
    expect(renderWorkHtml(w2)).toContain("panel--empty");
  });
});
