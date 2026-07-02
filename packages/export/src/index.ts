import type { Asset, Scene, Work } from "@novel-theater/types";

export type ExportFormat = "html" | "md";

/** 表示可能なコマ絵アセット（ready の image）を返す。 */
function readyImage(scene: Scene): Asset | undefined {
  return scene.assets.find((a) => a.kind === "image" && a.status === "ready");
}

/** `baseUrl` があれば相対 URL（/generated/...）を絶対化する。 */
function absUrl(url: string, baseUrl?: string): string {
  return baseUrl && url.startsWith("/") ? `${baseUrl.replace(/\/$/, "")}${url}` : url;
}

/**
 * 作品を単一ファイルの HTML（コマ絵＋本文の「劇場」）として書き出す（§10 Phase 4 エクスポート）。
 * 画像は storageUrl 参照（同一デプロイ内で完結）。MP4 / PDF / EPUB は将来 ffmpeg 等で追加。
 *
 * `baseUrl` を渡すと相対 URL（/generated/...）を絶対化し、ファイル単体でも画像を解決できる。
 */
export function renderWorkHtml(work: Work, opts: { baseUrl?: string } = {}): string {
  const panels = work.scenes
    .map((s) => {
      const img = readyImage(s);
      const text = work.sourceText.slice(s.sourceStart, s.sourceEnd);
      const figure = img
        ? `<img class="panel" src="${esc(absUrl(img.storageUrl, opts.baseUrl))}" alt="${esc(s.summary)}" loading="lazy" />`
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

/**
 * 作品を Markdown（コマ絵＋本文）として書き出す（§10 Phase 4 エクスポート・2 形式目）。
 * 画像は `![summary](url)` 参照。`baseUrl` で相対 URL を絶対化する。
 */
export function renderWorkMarkdown(work: Work, opts: { baseUrl?: string } = {}): string {
  const parts: string[] = [`# ${work.title}`, ""];
  work.scenes.forEach((s, i) => {
    const img = readyImage(s);
    const text = work.sourceText.slice(s.sourceStart, s.sourceEnd);
    parts.push(`## ${i + 1}. ${s.summary || "シーン"}`);
    parts.push("");
    parts.push(img ? `![${mdAlt(s.summary)}](${absUrl(img.storageUrl, opts.baseUrl)})` : "_（コマ未生成）_");
    parts.push("");
    if (text.trim()) {
      parts.push(text.trim());
      parts.push("");
    }
  });
  parts.push("---", `Generated with Novel-Theater · ${work.scenes.length} scenes`, "");
  return parts.join("\n");
}

/** 作品を指定形式で書き出す（ルーティング用ヘルパ）。 */
export function renderWork(
  work: Work,
  format: ExportFormat,
  opts: { baseUrl?: string } = {},
): { body: string; contentType: string; ext: string } {
  if (format === "md") {
    return { body: renderWorkMarkdown(work, opts), contentType: "text/markdown; charset=utf-8", ext: "md" };
  }
  return { body: renderWorkHtml(work, opts), contentType: "text/html; charset=utf-8", ext: "html" };
}

/** Markdown のリンクテキスト内で壊れる括弧類を除去する。 */
function mdAlt(s: string): string {
  return s.replace(/[\[\]]/g, "");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
