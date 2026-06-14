// 設定の読み書き。キーは storageScope に応じて local / session を使い分ける。
import type { Settings } from './types';
import { settingsSchema } from './schema';

export const DEFAULT_SETTINGS: Settings = {
  llm: { provider: 'claude', model: 'claude-sonnet-4-6', apiKey: '' },
  image: { provider: 'openai', model: 'gpt-image-1', apiKey: '', size: '1024x1024' },
  panelCount: { min: 6, max: 16 },
  styleDefault: 'アニメ調、淡い水彩、線細め、やわらかい光',
  storageScope: 'local',
  ttsEnabled: false,
};

const META_KEY = 'nt:settings';

/** どのスコープに保存されているかを記録するメタ（local に常駐）。 */
async function readScope(): Promise<'local' | 'session'> {
  const r = await chrome.storage.local.get('nt:scope');
  return r['nt:scope'] === 'session' ? 'session' : 'local';
}

export async function loadSettings(): Promise<Settings> {
  const scope = await readScope();
  const area = scope === 'session' ? chrome.storage.session : chrome.storage.local;
  const r = await area.get(META_KEY);
  const stored = r[META_KEY];
  if (!stored) return DEFAULT_SETTINGS;
  const parsed = settingsSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const valid = settingsSchema.parse(settings);
  // スコープ切替時は旧スコープを掃除する。
  const prevScope = await readScope();
  if (prevScope !== valid.storageScope) {
    const prevArea = prevScope === 'session' ? chrome.storage.session : chrome.storage.local;
    await prevArea.remove(META_KEY);
  }
  const area = valid.storageScope === 'session' ? chrome.storage.session : chrome.storage.local;
  await area.set({ [META_KEY]: valid });
  await chrome.storage.local.set({ 'nt:scope': valid.storageScope });
}

/**
 * キャッシュ無効化用のハッシュ。provider/model/style/panelCount を含める。
 * （apiKey は含めない。）
 */
export async function settingsHash(s: Settings): Promise<string> {
  const material = JSON.stringify({
    llm: { p: s.llm.provider, m: s.llm.model },
    image: { p: s.image.provider, m: s.image.model, size: s.image.size },
    style: s.styleDefault,
    panels: s.panelCount,
  });
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
