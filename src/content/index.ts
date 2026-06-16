// content script: サイト判定 → launcher 注入 → 抽出して background へ送信。
// SPA(カクヨム) の URL 変化も監視し、読書位置同期も担う。
import { adapterFor } from './siteAdapters/registry';
import { paragraphElements } from './siteAdapters/utils/dom';
import { mountLauncher, removeLauncher, setLauncherBusy } from './injectedUi/launcher';
import { scrollToParagraph, setupReadingSync, teardownReadingSync } from './readingSync';
import { isRpcEnvelope, sendRpc, type RpcEnvelope } from '@/shared/messaging';
import { loadSettings } from '@/shared/settings';
import type { ExtractedChapter } from '@/shared/types';

let currentUrl = location.href;

async function runExtraction(): Promise<ExtractedChapter | null> {
  const adapter = adapterFor(location);
  if (!adapter) return null;
  const ref = adapter.getChapterRef(location);
  if (!ref) return null;
  return adapter.extract(document, location);
}

/** 生成にかかる概算枚数を確認する。多い場合のみダイアログを出す。 */
async function confirmCost(): Promise<boolean> {
  const settings = await loadSettings();
  const maxImages = settings.panelCount.max;
  const CONFIRM_THRESHOLD = 8;
  if (maxImages <= CONFIRM_THRESHOLD) return true;
  return window.confirm(
    `Novel-Theater: 最大 ${maxImages} 枚の画像を生成します。\n` +
      `お使いの ${settings.image.provider} API の利用料が発生します。続けますか？`,
  );
}

async function launch(): Promise<void> {
  setLauncherBusy(true);
  try {
    const adapter = adapterFor(location);
    const chapter = await runExtraction();
    if (!chapter) {
      alert('Novel-Theater: この章の本文を取得できませんでした。');
      return;
    }
    if (!(await confirmCost())) return;

    await sendRpc('startJob', { chapter });

    // 読書位置同期をセットアップ。
    const body = await adapter?.getBodyElement(document);
    if (body) setupReadingSync(chapter.ref, paragraphElements(body));
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
    teardownReadingSync();
  }
}

// SPA ナビゲーション監視: pushState/replaceState/popstate と <title> 変化。
function installUrlWatcher(): void {
  const fire = () => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      teardownReadingSync();
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

// サイドパネル/ポップアップからの依頼に応答。
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!isRpcEnvelope(msg)) return undefined;
  const env = msg as RpcEnvelope;
  if (env.method === 'requestExtract') {
    launch().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (env.method === 'scrollToParagraph') {
    scrollToParagraph((env.payload as { paragraph: number }).paragraph);
    sendResponse({ ok: true });
    return false;
  }
  return undefined;
});

evaluatePage();
installUrlWatcher();
