"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestGenerate } from "@/lib/client";

const SAMPLE = `ある日の暮方の事である。一人の下人が、羅生門の下で雨やみを待っていた。

広い門の下には、この男のほかに誰もいない。ただ、所々丹塗の剥げた、大きな円柱に、蟋蟀が一匹とまっている。

下人は七段ある石段の一番上の段に、洗いざらした紺の襖の尻を据えて、ぼんやり、雨のふるのを眺めていた。`;

export function Composer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [style, setStyle] = useState("manga panel, ink, monochrome, detailed line art");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    setError(null);
    setLoading(true);
    try {
      const { workId } = await requestGenerate({ text, style, title: "投入テキスト" });
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
          placeholder="小説や文章を貼り付け…"
          onChange={(e) => setText(e.target.value)}
          style={{ marginTop: "0.5rem" }}
        />
      </label>

      <div style={{ display: "flex", gap: "0.75rem", margin: "0.75rem 0" }}>
        <button className="btn" onClick={() => setText(SAMPLE)} disabled={loading}>
          サンプルを読み込む
        </button>
        <button className="btn" onClick={() => setText("")} disabled={loading}>
          クリア
        </button>
      </div>

      <label>
        <span className="muted">アートスタイル</span>
        <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} style={{ marginTop: "0.4rem" }} />
      </label>

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
