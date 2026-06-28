import type { ImageGenerateInput, ImageGenerateResult, ImageProvider } from "@novel-theater/types";

const DIMS: Record<string, [number, number]> = {
  "16:9": [1024, 576],
  "4:3": [1024, 768],
  "1:1": [768, 768],
  "2:3": [640, 960],
};

/**
 * ネットワーク不要のダミー画像プロバイダ（§7.5 のダミー実装）。
 * 決定的な色とプロンプト文字列を描いた SVG プレースホルダを返す。
 * Phase 0 のオフライン動作・パイプラインの形の検証に用いる。
 */
export class DummyImageProvider implements ImageProvider {
  readonly id = "dummy";

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const started = Date.now();
    const seed = input.seed ?? hash(input.prompt);
    const [w, h] = DIMS[input.aspectRatio] ?? DIMS["4:3"]!;
    const hue = seed % 360;
    const svg = renderSvg(w, h, hue, input.prompt);
    const data = new TextEncoder().encode(svg);
    return {
      data,
      contentType: "image/svg+xml",
      cost: 0,
      latencyMs: Date.now() - started,
      seed,
    };
  }
}

function renderSvg(w: number, h: number, hue: number, prompt: string): string {
  const lines = wrap(prompt, 38).slice(0, 8);
  const tspans = lines
    .map((line, i) => `<tspan x="48" dy="${i === 0 ? 0 : 34}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 55% 38%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 40) % 360} 55% 22%)"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="24" y="24" width="${w - 48}" height="${h - 48}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>
  <text x="48" y="${Math.round(h * 0.32)}" font-family="sans-serif" font-size="26" fill="rgba(255,255,255,0.96)">${tspans}</text>
  <text x="48" y="${h - 40}" font-family="monospace" font-size="18" fill="rgba(255,255,255,0.6)">Novel-Theater · dummy panel</text>
</svg>`;
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const ch of text) {
    line += ch;
    if (line.length >= width) {
      out.push(line);
      line = "";
    }
  }
  if (line) out.push(line);
  return out.length ? out : ["(empty prompt)"];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100000;
}
