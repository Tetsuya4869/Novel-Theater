"use client";

import { useState } from "react";
import type { StoryBible } from "@novel-theater/types";

type SaveHandler = (
  characterId: string,
  patch: { appearance?: string; visualTags?: string[] },
) => void | Promise<void>;

/** Story Bible のキャラクター設定エディタ（§7.4）。編集→参照画像を再生成。 */
export function CharacterEditor({
  bible,
  onSave,
}: {
  bible: StoryBible;
  onSave: SaveHandler;
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
            appearance={c.appearance.description ?? ""}
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
  onSave: SaveHandler;
}) {
  const [app, setApp] = useState(appearance);
  const [tags, setTags] = useState(visualTags.join(", "));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await Promise.resolve(
        onSave(id, {
          appearance: app,
          visualTags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      );
    } finally {
      setSaving(false);
    }
  }

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
        <label className="chared__field">
          <span className="muted">外見</span>
          <input type="text" value={app} placeholder="髪・目・服装…" onChange={(e) => setApp(e.target.value)} />
        </label>
        <label className="chared__field">
          <span className="muted">視覚タグ（カンマ区切り）</span>
          <input type="text" value={tags} placeholder="black hair, red coat…" onChange={(e) => setTags(e.target.value)} />
        </label>
        <button className="btn btn--sm" disabled={saving} onClick={save}>
          {saving ? "参照画像を再生成中…" : "保存（参照画像を再生成）"}
        </button>
      </div>
    </div>
  );
}
