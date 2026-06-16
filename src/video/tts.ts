// Web Speech API による日本語ナレーション（実時間再生用）。
// 動画書き出しへの音声ミックスは将来拡張（プロバイダ TTS）として別途対応する。

export function ttsAvailable(): boolean {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** テキストを読み上げ、終了/中断で resolve する。 */
export function speak(text: string, signal?: AbortSignal): Promise<void> {
  if (!ttsAvailable() || !text.trim()) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.onend = () => resolve();
    u.onerror = () => resolve();
    if (signal) {
      signal.addEventListener('abort', () => {
        speechSynthesis.cancel();
        resolve();
      });
    }
    speechSynthesis.speak(u);
  });
}

export function cancelSpeech(): void {
  if (ttsAvailable()) speechSynthesis.cancel();
}
