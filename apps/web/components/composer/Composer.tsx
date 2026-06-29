"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestGenerate } from "@/lib/client";

// アートスタイルのプリセット（正は packages/ai の STYLE_PRESETS。
// クライアントバンドルにサーバー専用コードを混ぜないため、ここでは値のみをミラーする）。
const STYLE_PRESETS = [
  { id: "manga", label: "マンガ（白黒）", prompt: "manga panel, ink, monochrome, detailed line art, screentone" },
  { id: "anime", label: "アニメ調（カラー）", prompt: "anime style, vivid colors, cel shading, cinematic lighting" },
  { id: "watercolor", label: "水彩", prompt: "soft watercolor illustration, delicate washes, paper texture" },
  { id: "gekiga", label: "劇画", prompt: "gritty gekiga style, heavy ink, dramatic shadows, realistic" },
];

const SAMPLE = `ある日の暮方の事である。一人の下人が、羅生門の下で雨やみを待っていた。

広い門の下には、この男のほかに誰もいない。ただ、所々丹塗の剥げた、大きな円柱に、蟋蟀が一匹とまっている。

下人は七段ある石段の一番上の段に、洗いざらした紺の襖の尻を据えて、ぼんやり、雨のふるのを眺めていた。`;

const VIDEO_LEVELS: Array<{ id: "none" | "highlight" | "rich"; label: string }> = [
  { id: "none", label: "静止画のみ" },
  { id: "highlight", label: "ハイライトのみ動画" },
  { id: "rich", label: "多めに動画" },
];

export function Composer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [styleId, setStyleId] = useState(STYLE_PRESETS[0]!.id);
  const [videoLevel, setVideoLevel] = useState<"none" | "highlight" | "rich">("none");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    setError(null);
    setLoading(true);
    try {
      const preset = STYLE_PRESETS.find((p) => p.id === styleId) ?? STYLE_PRESETS[0]!;
      const { workId } = await requestGenerate({
        text,
        style: preset.prompt,
        videoLevel,
        title: "投入テキスト",
      });
      router.push(`/theater/${workId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成に失敗しました");
      setLoading(false);
    }
  }

  return (
    <div>
      <label>
        <strong>本文</strong>
        <textarea
          rows={12}
          value={text}
          placeholder="小説や文章を貼り付け…（5,000〜20,000 文字程度まで）"
          onChange={(e) => setText(e.target.value)}
          style={{ marginTop: "0.5rem" }}
        />
      </label>

      <div style={{ display: "flex", gap: "0.75rem", margin: "0.75rem 0", flexWrap: "wrap" }}>
        <button className="btn btn--ghost" onClick={() => setText(SAMPLE)} disabled={loading}>
          サンプルを読み込む
        </button>
        <button className="btn btn--ghost" onClick={() => setText("")} disabled={loading}>
          クリア
        </button>
      </div>

      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", margin: "0.5rem 0" }}>
        <label>
          <span className="muted">アートスタイル</span>
          <select
            value={styleId}
            onChange={(e) => setStyleId(e.target.value)}
            style={{ display: "block", marginTop: "0.4rem" }}
          >
            {STYLE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="muted">動画化</span>
          <select
            value={videoLevel}
            onChange={(e) => setVideoLevel(e.target.value as "none" | "highlight" | "rich")}
            style={{ display: "block", marginTop: "0.4rem" }}
          >
            {VIDEO_LEVELS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="error" style={{ marginTop: "1rem" }}>
          {error}
        </p>
      )}

      <p style={{ marginTop: "1.25rem" }}>
        <button className="btn" onClick={onGenerate} disabled={loading || text.trim().length === 0}>
          {loading ? "上映を準備中…" : "上映開始"}
        </button>
      </p>
    </div>
  );
}
