import { useEffect } from 'react';
import { useStore } from './store';
import { PanelGrid } from './components/PanelGrid';
import { isPushEvent, sendRpc } from '@/shared/messaging';

const PHASE_LABEL: Record<string, string> = {
  extracting: '本文を抽出中…',
  analyzing: 'シーンを解析中…',
  generating: 'コマ絵を生成中…',
  done: '完成',
  error: 'エラー',
  idle: '',
};

export function App() {
  const { chapter, job, loading, refresh, setJob, addImage, setVisibleParagraph } = useStore();

  useEffect(() => {
    refresh();
    const listener = (msg: unknown) => {
      if (!isPushEvent(msg)) return;
      if (msg.type === 'job:update') {
        setJob(msg.job);
        refresh();
      } else if (msg.type === 'panel:image') {
        addImage({ index: msg.index, dataUrl: msg.dataUrl });
      } else if (msg.type === 'visible:paragraph') {
        setVisibleParagraph(msg.paragraph);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refresh, setJob, addImage, setVisibleParagraph]);

  const isKeyError = !!job?.error && /API キー/.test(job.error);

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
      {job && job.phase !== 'idle' && (
        <div className={`progress ${job.phase}`}>
          {PHASE_LABEL[job.phase] ?? job.phase}
          {job.phase === 'generating' &&
            job.panels.length > 0 &&
            `（${job.panels.filter((p) => p.status === 'done').length}/${job.panels.length}）`}
          {job.phase === 'error' && job.error && <div className="err">{job.error}</div>}
          {job.phase === 'error' && (
            <div className="err-actions">
              {isKeyError ? (
                <button className="ghost small" onClick={() => chrome.runtime.openOptionsPage()}>
                  ⚙ 設定を開く
                </button>
              ) : (
                <button className="ghost small" onClick={() => void sendRpc('retryJob', {})}>
                  🔄 再試行
                </button>
              )}
            </div>
          )}
        </div>
      )}
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
