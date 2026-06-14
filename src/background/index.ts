// background service worker: メッセージルータ。
import { isRpcEnvelope, type RpcEnvelope, type RpcMap } from '@/shared/messaging';
import { getActive } from './pipeline/jobStore';
import { regeneratePanel, startJob } from './pipeline/orchestrator';

// 拡張アイコンのクリックでサイドパネルを開く設定。
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

type Handler<M extends keyof RpcMap> = (
  payload: RpcMap[M]['req'],
  sender: chrome.runtime.MessageSender,
) => Promise<RpcMap[M]['res']>;

const handlers: { [M in keyof RpcMap]?: Handler<M> } = {
  startJob: async ({ chapter }, sender) => {
    // ユーザー操作起点なのでサイドパネルを開ける。
    if (sender.tab?.id != null && chrome.sidePanel?.open) {
      try {
        await chrome.sidePanel.open({ tabId: sender.tab.id });
      } catch {
        /* 起点要件を満たさない場合は無視（ユーザーが手動で開く） */
      }
    }
    const jobId = await startJob(chapter);
    return { jobId };
  },

  getActiveChapter: async () => {
    const active = await getActive();
    return {
      chapter: active?.chapter ?? null,
      job: active?.job ?? null,
      analysis: active?.analysis ?? null,
    };
  },

  getJob: async () => {
    const active = await getActive();
    return { job: active?.job ?? null };
  },

  getAnalysis: async () => {
    const active = await getActive();
    return { analysis: active?.analysis ?? null };
  },

  requestExtract: async () => ({ ok: true }),

  regeneratePanel: async ({ ref, index, promptOverride }) => {
    await regeneratePanel(ref, index, promptOverride);
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  if (!isRpcEnvelope(msg)) return undefined;
  const env = msg as RpcEnvelope;
  const handler = handlers[env.method] as Handler<typeof env.method> | undefined;
  if (!handler) return undefined;
  handler(env.payload, sender)
    .then(sendResponse)
    .catch((e) => sendResponse({ __error: String(e) }));
  return true; // 非同期応答
});
