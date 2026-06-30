import type { Env } from "@novel-theater/config";
import type { VoiceProvider } from "@novel-theater/types";

const SAMPLE_RATE = 8_000;

/**
 * ネットワーク不要のダミー TTS（§7.7）。本物の音声の代わりに、文字数に応じた長さの
 * 低音量サイン波 WAV を生成する。再生可能な実ファイルなのでタイムライン同期を検証できる。
 * 本物の TTS は ElevenLabs / Google / OpenAI（要 API キー）。
 */
export class DummyVoiceProvider implements VoiceProvider {
  readonly id = "dummy-voice";

  async synthesize(input: {
    text: string;
    voiceId: string;
    lang: string;
  }): Promise<{ data: Uint8Array; contentType: string; cost: number; durationSec: number }> {
    const durationSec = clampDuration(input.text.length);
    const data = encodeWav(durationSec);
    return { data, contentType: "audio/wav", cost: 0, durationSec };
  }
}

/** ElevenLabs 経由の本番候補（スタブ）。モデル/声 ID・単価は採用時に確定。 */
export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly id = "elevenlabs";
  constructor(
    private readonly apiKey: string,
    private readonly defaultVoiceId = "Rachel",
    private readonly costPerKChar = 0,
  ) {}

  async synthesize(input: {
    text: string;
    voiceId: string;
    lang: string;
  }): Promise<{ data: Uint8Array; contentType: string; cost: number; durationSec: number }> {
    const voice = input.voiceId && input.voiceId !== "default" ? input.voiceId : this.defaultVoiceId;
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: { "xi-api-key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.text, model_id: "eleven_multilingual_v2" }),
    });
    if (!res.ok) throw new Error(`ElevenLabs TTS 失敗: ${res.status} ${res.statusText}`);
    const data = new Uint8Array(await res.arrayBuffer());
    return {
      data,
      contentType: res.headers.get("content-type") ?? "audio/mpeg",
      cost: (input.text.length / 1000) * this.costPerKChar,
      durationSec: clampDuration(input.text.length),
    };
  }
}

/** env から TTS プロバイダを選択する。未対応時は dummy へ安全フォールバック。 */
export function createVoiceProvider(env: Env): VoiceProvider {
  if (env.TTS_PROVIDER === "elevenlabs" && env.ELEVENLABS_API_KEY) {
    return new ElevenLabsVoiceProvider(env.ELEVENLABS_API_KEY);
  }
  return new DummyVoiceProvider();
}

function clampDuration(chars: number): number {
  return Math.max(2, Math.min(12, Math.round((2 + chars / 8) * 10) / 10));
}

/** 低音量サイン波の 16-bit PCM モノ WAV を生成する。 */
function encodeWav(durationSec: number): Uint8Array {
  const numSamples = Math.floor(SAMPLE_RATE * durationSec);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const freq = 220;
  const amp = 0.05 * 0x7fff;
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(amp * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE));
    view.setInt16(44 + i * bytesPerSample, sample, true);
  }
  return new Uint8Array(buffer);
}

function writeStr(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
