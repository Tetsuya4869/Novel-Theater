import { forwardRef } from 'react';
import type { Panel, PanelStatus } from '@/shared/types';

interface Props {
  index: number;
  panel?: Panel;
  /** 解析前の素テキスト表示用。 */
  rawText?: string;
  imageUrl?: string;
  status?: PanelStatus;
  error?: string;
  active?: boolean;
  onRegenerate?: (index: number) => void;
  onJump?: (panel: Panel) => void;
}

const STATUS_LABEL: Record<PanelStatus, string> = {
  pending: '待機中',
  generating: '生成中…',
  done: '',
  error: 'エラー',
};

export const PanelCard = forwardRef<HTMLDivElement, Props>(function PanelCard(
  { index, panel, rawText, imageUrl, status, error, active, onRegenerate, onJump },
  ref,
) {
  return (
    <div className={`panel-card${active ? ' active' : ''}`} ref={ref}>
      <div className="card-head">
        <span className="idx">#{index + 1}</span>
        {status && status !== 'done' && <span className="status">{STATUS_LABEL[status]}</span>}
        {panel && onJump && (
          <button className="ghost small" onClick={() => onJump(panel)} title="本文の該当箇所へ">
            📖 本文へ
          </button>
        )}
        {panel && onRegenerate && (
          <button className="ghost small" onClick={() => onRegenerate(index)}>
            🔄 再生成
          </button>
        )}
      </div>

      {imageUrl ? (
        <img src={imageUrl} alt={`panel ${index + 1}`} />
      ) : (
        status &&
        status !== 'done' && (
          <div className={`placeholder ${status}`}>
            {status === 'error' ? `⚠ ${error ?? '生成に失敗しました'}` : '🎨 生成中…'}
          </div>
        )
      )}

      {panel ? (
        <>
          {panel.caption && <div className="text">{panel.caption}</div>}
          {panel.dialogue?.map((d, i) => (
            <div className="text dialogue" key={i}>
              「{d.text}」
            </div>
          ))}
        </>
      ) : (
        <div className="text">{rawText}</div>
      )}
    </div>
  );
});
