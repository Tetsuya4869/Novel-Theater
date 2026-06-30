import type { Work } from "@novel-theater/types";

export type ExportFormat = "html";

/**
 * 作品を単一ファイルの HTML（コマ絵＋本文の「劇場」）として書き出す（§10 Phase 4 エクスポート）。
 * 画像は storageUrl 参照（同一デプロイ内で完結）。MP4 / PDF / EPUB は将来 ffmpeg 等で追加。
 *
 * `baseUrl` を渡すと相対 URL（/generated/...）を絶対化し、ファイル単体でも画像を解決できる。
 */
export function renderWorkHtml(work: Work, opts: { baseUrl?: string } = {}): string {
  const abs = (url: string) =>
    opts.baseUrl && url.startsWith("/") ? `${opts.baseUrl.replace(/\/$/, "")}${url}` : url;

  const panels = work.scenes
    .map((s) => {
      const img = s.assets.find((a) => a.kind === "image" && a.status === "ready");
      const text = work.sourceText.slice(s.sourceStart, s.sourceEnd);
      const figure = img
        ? `<img class="panel" src="${esc(abs(img.storageUrl))}" alt="${esc(s.summary)}" loading="lazy" />`
        : `<div class="panel panel--empty">（コマ未生成）</div>`;
      return `<section class="scene">
  ${figure}
  <div class="text">${esc(text).replace(/\n/g, "<br/>")}</div>
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="${esc(work.language || "ja")}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="Novel-Theater" />
<title>${esc(work.title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#14110f; color:#efe9e1; font-family: system-ui, "Noto Sans JP", sans-serif; line-height:1.8; }
  header { padding: 2rem 1.25rem; border-bottom:1px solid #322b25; }
  h1 { margin:0; }
  main { max-width: 860px; margin: 0 auto; padding: 1.5rem 1.25rem; }
  .scene { margin: 0 0 2.5rem; }
  .panel { width:100%; display:block; border:1px solid #322b25; border-radius:10px; }
  .panel--empty { aspect-ratio:4/3; display:grid; place-items:center; color:#a89e92; background:#1d1916; }
  .text { margin-top: 0.75rem; }
  footer { color:#a89e92; font-size:.85rem; padding: 1.5rem 1.25rem; border-top:1px solid #322b25; text-align:center; }
</style>
</head>
<body>
<header><h1>${esc(work.title)}</h1></header>
<main>
${panels}
</main>
<footer>Generated with Novel-Theater · ${work.scenes.length} scenes</footer>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
