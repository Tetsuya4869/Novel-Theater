// ポップアップ: サイドパネルを開く / 設定を開く。
document.getElementById('open-panel')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null && chrome.sidePanel?.open) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
  window.close();
});

document.getElementById('open-options')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
