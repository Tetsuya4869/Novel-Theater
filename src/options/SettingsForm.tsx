import { useEffect, useState } from 'react';
import type { ImageProviderId, LLMProviderId, Settings } from '@/shared/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '@/shared/settings';

const LLM_MODELS: Record<LLMProviderId, string[]> = {
  claude: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
};

const IMAGE_MODELS: Record<ImageProviderId, string[]> = {
  openai: ['gpt-image-1', 'dall-e-3'],
  imagen: ['imagen-3.0-generate-002'],
  stability: ['sd3.5-large', 'sd3.5-medium'],
};

const IMAGE_SIZES = ['1024x1024', '1024x1536', '1536x1024'];

const wrap: React.CSSProperties = {
  maxWidth: 640,
  margin: '0 auto',
  padding: 24,
  fontFamily: 'system-ui, sans-serif',
  lineHeight: 1.6,
};
const field: React.CSSProperties = { display: 'block', marginBottom: 16 };
const label: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 14 };
const input: React.CSSProperties = { width: '100%', padding: 8, fontSize: 14, boxSizing: 'border-box' };

export function SettingsForm() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings().then(setS);
  }, []);

  const update = (patch: Partial<Settings>) => {
    setS((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  const save = async () => {
    await saveSettings(s);
    setSaved(true);
  };

  return (
    <div style={wrap}>
      <h1>Novel-Theater 設定</h1>
      <p style={{ fontSize: 13, opacity: 0.8 }}>
        API キーはこの端末の chrome.storage に保存され、選択したプロバイダの API
        にのみ送信されます（バックエンドはありません）。共有端末では保存スコープを
        「session」にすることを推奨します。
      </p>

      <h2 style={{ fontSize: 16 }}>シーン解析（LLM）</h2>
      <label style={field}>
        <span style={label}>プロバイダ</span>
        <select
          style={input}
          value={s.llm.provider}
          onChange={(e) => {
            const provider = e.target.value as LLMProviderId;
            update({ llm: { ...s.llm, provider, model: LLM_MODELS[provider][0] } });
          }}
        >
          <option value="claude">Claude (Anthropic)</option>
          <option value="gemini">Gemini (Google)</option>
        </select>
      </label>
      <label style={field}>
        <span style={label}>モデル</span>
        <select
          style={input}
          value={s.llm.model}
          onChange={(e) => update({ llm: { ...s.llm, model: e.target.value } })}
        >
          {LLM_MODELS[s.llm.provider].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label style={field}>
        <span style={label}>API キー</span>
        <input
          style={input}
          type="password"
          value={s.llm.apiKey}
          placeholder="sk-... / AIza..."
          onChange={(e) => update({ llm: { ...s.llm, apiKey: e.target.value } })}
        />
      </label>

      <h2 style={{ fontSize: 16 }}>画像生成</h2>
      <label style={field}>
        <span style={label}>プロバイダ</span>
        <select
          style={input}
          value={s.image.provider}
          onChange={(e) => {
            const provider = e.target.value as ImageProviderId;
            update({ image: { ...s.image, provider, model: IMAGE_MODELS[provider][0] } });
          }}
        >
          <option value="openai">OpenAI (gpt-image-1 / DALL·E)</option>
          <option value="imagen">Google Imagen</option>
          <option value="stability">Stability AI</option>
        </select>
      </label>
      <label style={field}>
        <span style={label}>モデル</span>
        <select
          style={input}
          value={s.image.model}
          onChange={(e) => update({ image: { ...s.image, model: e.target.value } })}
        >
          {IMAGE_MODELS[s.image.provider].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label style={field}>
        <span style={label}>サイズ</span>
        <select
          style={input}
          value={s.image.size}
          onChange={(e) => update({ image: { ...s.image, size: e.target.value } })}
        >
          {IMAGE_SIZES.map((sz) => (
            <option key={sz} value={sz}>
              {sz}
            </option>
          ))}
        </select>
      </label>
      <label style={field}>
        <span style={label}>API キー</span>
        <input
          style={input}
          type="password"
          value={s.image.apiKey}
          onChange={(e) => update({ image: { ...s.image, apiKey: e.target.value } })}
        />
      </label>

      <h2 style={{ fontSize: 16 }}>生成設定</h2>
      <label style={field}>
        <span style={label}>既定の画風</span>
        <input
          style={input}
          value={s.styleDefault}
          onChange={(e) => update({ styleDefault: e.target.value })}
        />
      </label>
      <label style={field}>
        <span style={label}>
          コマ数（{s.panelCount.min}〜{s.panelCount.max}）
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={input}
            type="number"
            min={1}
            value={s.panelCount.min}
            onChange={(e) =>
              update({ panelCount: { ...s.panelCount, min: Number(e.target.value) } })
            }
          />
          <input
            style={input}
            type="number"
            min={1}
            value={s.panelCount.max}
            onChange={(e) =>
              update({ panelCount: { ...s.panelCount, max: Number(e.target.value) } })
            }
          />
        </div>
      </label>
      <label style={field}>
        <span style={label}>キーの保存スコープ</span>
        <select
          style={input}
          value={s.storageScope}
          onChange={(e) => update({ storageScope: e.target.value as Settings['storageScope'] })}
        >
          <option value="local">local（端末に保持）</option>
          <option value="session">session（ブラウザ終了で消去）</option>
        </select>
      </label>

      <button
        onClick={save}
        style={{
          font: 'inherit',
          fontWeight: 600,
          color: '#fff',
          background: 'linear-gradient(135deg,#6d5dfc,#c44bd8)',
          border: 'none',
          borderRadius: 8,
          padding: '10px 20px',
          cursor: 'pointer',
        }}
      >
        保存
      </button>
      {saved && <span style={{ marginLeft: 12, color: 'green' }}>保存しました ✓</span>}
    </div>
  );
}
