import type { VideoProvider } from "@novel-theater/types";

/**
 * ネットワーク不要のダミー動画プロバイダ（§7.6 の擬似アニメ/ダミー）。
 * SMIL アニメーション付き SVG を「動画クリップ」の代用として返す。
 * <img> で表示すると動く実ファイルになり、オフラインでパイプラインの形を検証できる。
 * 本物の image-to-video は FalVideoProvider（要 API キー）。
 */
export class DummyVideoProvider implements VideoProvider {
  readonly id = "dummy-video";

  async animate(input: {
    sourceImageUrl: string;
    motionPrompt: string;
    durationSec: number;
  }): Promise<{ data: Uint8Array; contentType: string; cost: number; latencyMs: number }> {
    const started = Date.now();
    const dur = Math.max(2, Math.min(6, input.durationSec || 4));
    const svg = renderAnimatedSvg(dur, input.motionPrompt);
    return {
      data: new TextEncoder().encode(svg),
      contentType: "image/svg+xml",
      cost: 0,
      latencyMs: Date.now() - started,
    };
  }
}

function renderAnimatedSvg(durationSec: number, motionPrompt: string): string {
  const w = 1024;
  const h = 576;
  const hue = hash(motionPrompt) % 360;
  const label = escapeXml(truncate(motionPrompt, 60));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 55% 36%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 50) % 360} 55% 18%)"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <g>
    <animateTransform attributeName="transform" type="translate"
      values="0 0; -40 -24; 0 0" dur="${durationSec}s" repeatCount="indefinite"/>
    <circle cx="${w * 0.7}" cy="${h * 0.4}" r="120" fill="rgba(255,255,255,0.10)"/>
    <circle cx="${w * 0.3}" cy="${h * 0.7}" r="80" fill="rgba(255,255,255,0.08)"/>
  </g>
  <polygon points="${w / 2 - 26},${h / 2 - 32} ${w / 2 - 26},${h / 2 + 32} ${w / 2 + 34},${h / 2}" fill="rgba(255,255,255,0.85)">
    <animate attributeName="opacity" values="0.85;0.3;0.85" dur="1.6s" repeatCount="indefinite"/>
  </polygon>
  <text x="48" y="${h - 40}" font-family="sans-serif" font-size="22" fill="rgba(255,255,255,0.9)">${label}</text>
  <text x="48" y="${h - 14}" font-family="monospace" font-size="16" fill="rgba(255,255,255,0.55)">Novel-Theater · dummy clip (${durationSec}s)</text>
</svg>`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
