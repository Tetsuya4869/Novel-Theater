// dist/ がブラウザに読み込める正しい拡張機能になっているか検証する。
// manifest.json が参照する全アセットの存在と MV3 必須項目をチェックする。
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const manifestPath = resolve(dist, 'manifest.json');

const errors = [];
const checked = [];

if (!existsSync(manifestPath)) {
  console.error('✗ dist/manifest.json がありません。先に `npm run build` を実行してください。');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

function checkAsset(p, label) {
  if (!p) return;
  checked.push(p);
  if (!existsSync(resolve(dist, p))) {
    errors.push(`${label}: 参照先 "${p}" が dist に存在しません`);
  }
}

// MV3 必須項目
if (manifest.manifest_version !== 3) errors.push('manifest_version が 3 ではありません');
if (!manifest.name) errors.push('name がありません');
if (!manifest.version) errors.push('version がありません');

// default_locale を使うなら _locales/<locale>/messages.json が必須
if (manifest.default_locale) {
  const msg = `_locales/${manifest.default_locale}/messages.json`;
  checkAsset(msg, 'default_locale');
}

// 各エントリポイント
for (const [size, p] of Object.entries(manifest.icons ?? {})) checkAsset(p, `icons.${size}`);
checkAsset(manifest.action?.default_popup, 'action.default_popup');
checkAsset(manifest.action?.default_icon, 'action.default_icon');
checkAsset(manifest.background?.service_worker, 'background.service_worker');
checkAsset(manifest.side_panel?.default_path, 'side_panel.default_path');
checkAsset(manifest.options_page, 'options_page');
for (const [i, cs] of (manifest.content_scripts ?? []).entries()) {
  for (const js of cs.js ?? []) checkAsset(js, `content_scripts[${i}].js`);
  for (const css of cs.css ?? []) checkAsset(css, `content_scripts[${i}].css`);
}
for (const war of manifest.web_accessible_resources ?? []) {
  for (const r of war.resources ?? []) checkAsset(r, 'web_accessible_resources');
}

if (errors.length > 0) {
  console.error('✗ 拡張機能の検証に失敗しました:\n');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

console.log(`✓ 拡張機能の検証 OK（${checked.length} アセットを確認、manifest v3）`);
console.log(`  name: ${manifest.name} v${manifest.version}`);
