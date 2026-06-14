// content script: サイト判定 → launcher 注入 → 抽出して background へ送信。
// SPA(カクヨム) の URL 変化も監視する。
import { adapterFor } from './siteAdapters/registry';
import { mountLauncher, removeLauncher, setLauncherBusy } from './injectedUi/launcher';
import { isRpcEnvelope, sendRpc } from '@/shared/messaging';
import type { ExtractedChapter } from '@/shared/types';

let currentUrl = location.href;

async function runExtraction(): Promise<ExtractedChapter | null> {
  const adapter = adapterFor(location);
  if (!adapter) return null;
  const ref = adapter.getChapterRef(location);
  if (!ref) return null;
  return adapter.extract(document, location);
}

async function launch(): Promise<void> {
  setLauncherBusy(true);
  try {
    const chapter = await runExtraction();
    if (!chapter) {
      alert('Novel-Theater: この章の本文を取得できませんでした。');
      return;
    }
    // サイドパネルを開くのは background 側（ユーザー操作起点が必要）。
    await sendRpc('startJob', { chapter });
  } catch (e) {
    console.error('[Novel-Theater]', e);
    alert('Novel-Theater: 抽出に失敗しました。\n' + (e as Error).message);
  } finally {
    setLauncherBusy(false);
  }
}

function evaluatePage(): void {
  const adapter = adapterFor(location);
  const ref = adapter?.getChapterRef(location) ?? null;
  if (ref) {
    mountLauncher(launch);
  } else {
    removeLauncher();
  }
}

// SPA ナビゲーション監視: pushState/replaceState/popstate と <title> 変化。
function installUrlWatcher(): void {
  const fire = () => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      evaluatePage();
    }
  };
  for (const m of ['pushState', 'replaceState'] as const) {
    const orig = history[m];
    history[m] = function (this: History, ...args: Parameters<typeof orig>) {
      const r = orig.apply(this, args);
      queueMicrotask(fire);
      return r;
    } as typeof orig;
  }
  window.addEventListener('popstate', fire);
  // タイトル変化でも再評価（カクヨムのエピソード遷移対策）。
  const titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(fire).observe(titleEl, { childList: true });
  }
}

// サイドパネル/ポップアップからの「抽出して」依頼に応答。
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (isRpcEnvelope(msg) && msg.method === 'requestExtract') {
    launch().then(() => sendResponse({ ok: true }));
    return true; // 非同期応答
  }
  return undefined;
});

evaluatePage();
installUrlWatcher();
