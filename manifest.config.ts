import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Novel-Theater',
  version: '0.1.0',
  description: '小説、文章をコマ絵、動画化しながら読める',
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Novel-Theater',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  options_page: 'src/options/index.html',
  content_scripts: [
    {
      matches: ['https://*.syosetu.com/*', 'https://kakuyomu.jp/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'sidePanel', 'activeTab'],
  host_permissions: [
    'https://api.openai.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://api.stability.ai/*',
    'https://api.anthropic.com/*',
  ],
});
