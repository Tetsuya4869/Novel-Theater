// dist/ を配布用 zip にまとめる（Chrome ウェブストア / 手動配布用）。
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const releaseDir = resolve(root, 'release');

if (!existsSync(resolve(dist, 'manifest.json'))) {
  console.error('✗ dist が見つかりません。先に `npm run build` を実行してください。');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf-8'));
mkdirSync(releaseDir, { recursive: true });
const out = resolve(releaseDir, `novel-theater-v${version}.zip`);

// dist の中身（ソースマップ除く）を zip 化。
execFileSync('zip', ['-r', '-X', out, '.', '-x', '*.map'], { cwd: dist, stdio: 'inherit' });
console.log(`✓ パッケージを作成しました: release/novel-theater-v${version}.zip`);
