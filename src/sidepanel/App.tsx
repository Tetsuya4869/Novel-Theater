import { useEffect } from 'react';
import { useStore } from './store';
import { PanelGrid } from './components/PanelGrid';
import { isPushEvent } from '@/shared/messaging';

export function App() {
  const { chapter, loading, refresh, setJob, addImage } = useStore();

  useEffect(() => {
    refresh();
    const listener = (msg: unknown) => {
      if (!isPushEvent(msg)) return;
      if (msg.type === 'job:update') {
        setJob(msg.job);
        refresh();
      } else if (msg.type === 'panel:image') {
        addImage({ index: msg.index, dataUrl: msg.dataUrl });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refresh, setJob, addImage]);

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Novel-Theater</h1>
          {chapter && <div className="title">{chapter.title}</div>}
        </div>
        <button className="ghost" onClick={() => chrome.runtime.openOptionsPage()}>
          ⚙ 設定
        </button>
      </header>
      <div className="content">
        {loading && !chapter ? (
          <div className="empty">読み込み中…</div>
        ) : chapter ? (
          <PanelGrid />
        ) : (
          <div className="empty">
            小説家になろう / カクヨム の本文ページで
            <br />
            「🎬 コマ絵化」ボタンを押してください。
          </div>
        )}
      </div>
    </div>
  );
}
