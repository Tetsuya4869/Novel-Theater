import type { Panel } from '@/shared/types';

interface Props {
  index: number;
  panel?: Panel;
  /** M1: 解析前の素テキスト表示用。 */
  rawText?: string;
  imageUrl?: string;
}

export function PanelCard({ index, panel, rawText, imageUrl }: Props) {
  return (
    <div className="panel-card">
      <div className="idx">#{index + 1}</div>
      {imageUrl && <img src={imageUrl} alt={`panel ${index + 1}`} />}
      {panel ? (
        <>
          {panel.caption && <div className="text">{panel.caption}</div>}
          {panel.dialogue?.map((d, i) => (
            <div className="text" key={i}>
              「{d.text}」
            </div>
          ))}
        </>
      ) : (
        <div className="text">{rawText}</div>
      )}
    </div>
  );
}
