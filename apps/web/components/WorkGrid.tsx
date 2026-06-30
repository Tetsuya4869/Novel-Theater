import Link from "next/link";
import type { StoredWork } from "@novel-theater/db";
import type { Work } from "@novel-theater/types";

/** 一覧用の軽量サマリ（サーバーで StoredWork から抽出して渡す）。 */
export interface WorkSummary {
  id: string;
  title: string;
  visibility: Work["visibility"];
  scenes: number;
  ready: number;
  likeCount: number;
  thumbUrl?: string;
}

const VISIBILITY_LABEL: Record<Work["visibility"], string> = {
  private: "非公開",
  unlisted: "限定公開",
  public: "公開",
};

/** 作品カードのグリッド（ライブラリ / ギャラリー共通）。 */
export function WorkGrid({ works }: { works: WorkSummary[] }) {
  if (works.length === 0) {
    return <p className="muted">まだ作品がありません。</p>;
  }
  return (
    <div className="workgrid">
      {works.map((w) => (
        <Link key={w.id} className="workcard" href={`/theater/${w.id}`}>
          <div className="workcard__thumb">
            {w.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={w.thumbUrl} alt="" loading="lazy" />
            ) : (
              <span className="muted">（未生成）</span>
            )}
          </div>
          <div className="workcard__body">
            <strong>{w.title || "無題"}</strong>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              {VISIBILITY_LABEL[w.visibility]} ・ コマ {w.ready}/{w.scenes}
              {w.likeCount > 0 && ` ・ ♥ ${w.likeCount}`}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** StoredWork からカード用サマリを作る。 */
export function toSummary(stored: StoredWork): WorkSummary {
  const work = stored.work;
  let ready = 0;
  let thumbUrl: string | undefined;
  for (const s of work.scenes) {
    const img = s.assets.find((a) => a.kind === "image" && a.status === "ready");
    if (img) {
      ready++;
      if (!thumbUrl) thumbUrl = img.storageUrl;
    }
  }
  return {
    id: work.id,
    title: work.title,
    visibility: work.visibility,
    scenes: work.scenes.length,
    ready,
    likeCount: stored.likeCount ?? 0,
    thumbUrl,
  };
}
