"use client";

import { useState } from "react";
import type { StoryBible } from "@novel-theater/types";

/** Story Bible のキャラクター設定エディタ（§7.4）。編集→参照画像を再生成。 */
export function CharacterEditor({
  bible,
  onSave,
}: {
  bible: StoryBible;
  onSave: (characterId: string, patch: { appearance?: string; visualTags?: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  if (bible.characters.length === 0) return null;

  return (
    <details className="chared" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>キャラクター設定（{bible.characters.length}）</summary>
      <div className="chared__list">
        {bible.characters.map((c) => (
          <CharacterRow
            key={c.id}
            id={c.id}
            name={c.name}
            referenceImageUrl={c.referenceImageUrl}
            appearance={
              typeof (c.appearance as { description?: string }).description === "string"
                ? (c.appearance as { description?: string }).description!
                : ""
            }
            visualTags={c.visualTags}
            onSave={onSave}
          />
        ))}
      </div>
    </details>
  );
}

function CharacterRow({
  id,
  name,
  referenceImageUrl,
  appearance,
  visualTags,
  onSave,
}: {
  id: string;
  name: string;
  referenceImageUrl?: string;
  appearance: string;
  visualTags: string[];
  onSave: (characterId: string, patch: { appearance?: string; visualTags?: string[] }) => void;
}) {
  const [app, setApp] = useState(appearance);
  const [tags, setTags] = useState(visualTags.join(", "));

  return (
    <div className="chared__row">
      {referenceImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="chared__ref" src={referenceImageUrl} alt={name} />
      ) : (
        <div className="chared__ref chared__ref--empty">参照なし</div>
      )}
      <div className="chared__fields">
        <strong>{name}</strong>
        <input type="text" value={app} placeholder="外見（髪・目・服装…）" onChange={(e) => setApp(e.target.value)} />
        <input type="text" value={tags} placeholder="視覚タグ（カンマ区切り）" onChange={(e) => setTags(e.target.value)} />
        <button
          className="btn btn--sm"
          onClick={() =>
            onSave(id, {
              appearance: app,
              visualTags: tags.split(",").map((t) => t.trim()).filter(Boolean),
            })
          }
        >
          保存（参照画像を再生成）
        </button>
      </div>
    </div>
  );
}
