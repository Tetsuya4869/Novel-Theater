// 本文 → SceneAnalysis(JSON) を生成させる LLM プロンプト。
import type { Settings } from '../types';

export interface AnalysisPromptInput {
  title: string;
  text: string;
  styleDefault: string;
  panelMin: number;
  panelMax: number;
}

export function buildSystemPrompt(): string {
  return [
    'あなたは小説本文をコマ漫画（紙芝居）の絵コンテへ変換する編集者です。',
    '与えられた本文を読み、印象的な場面ごとにコマへ分割し、各コマに対する',
    '画像生成用プロンプトを作成してください。',
    '出力は指定された JSON スキーマに厳密に従い、JSON 以外の文字を含めないこと。',
    '画像プロンプトと描写はすべて日本語で記述してください。',
    'キャラクターは一度だけ characters に定義し、各コマでは characterRefs で id を参照します。',
    '同一キャラの appearance（外見記述）は全コマで一貫させ、各 imagePrompt の冒頭に',
    'styleGuide と登場キャラの appearance を必ず織り込み、画風・キャラの一貫性を保つこと。',
    '実在人物・著作権を侵害する固有表現は避け、健全な表現にとどめること。',
  ].join('\n');
}

export function buildUserPrompt(input: AnalysisPromptInput): string {
  const schema = {
    styleGuide: '章全体で一定の画風記述（例: アニメ調、淡い水彩、線細め）',
    characters: [{ id: 'char_xxx', name: '名前', appearance: '髪色・服装・年齢感など' }],
    panels: [
      {
        index: 0,
        caption: 'ナレーション/地の文の要約（任意）',
        dialogue: [{ speakerId: 'char_xxx', text: 'セリフ' }],
        characterRefs: ['char_xxx'],
        sceneDescription: '中立的な情景描写',
        imagePrompt: 'styleGuide + キャラ appearance + 情景を織り込んだ最終プロンプト',
        styleHints: 'このコマ固有の画風メモ',
        sourceParagraphs: [0, 2],
      },
    ],
  };
  return [
    `# 作品タイトル\n${input.title}`,
    `# 希望する画風\n${input.styleDefault}`,
    `# コマ数の目安\n${input.panelMin}〜${input.panelMax} コマ（本文の長さに応じて調整）`,
    '# 出力 JSON スキーマ（この形に厳密に従うこと）',
    '```json',
    JSON.stringify(schema, null, 2),
    '```',
    '# 本文（段落は改行区切り。sourceParagraphs は 0 始まりの段落インデックス範囲）',
    input.text,
  ].join('\n\n');
}

export function fromSettings(
  s: Settings,
  title: string,
  text: string,
): AnalysisPromptInput {
  return {
    title,
    text,
    styleDefault: s.styleDefault,
    panelMin: s.panelCount.min,
    panelMax: s.panelCount.max,
  };
}
