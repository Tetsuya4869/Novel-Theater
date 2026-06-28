import Link from "next/link";
import { Composer } from "@/components/composer/Composer";

export default function ComposePage() {
  return (
    <main className="container">
      <p>
        <Link href="/">← トップ</Link>
      </p>
      <h1>テキストを投入</h1>
      <p className="muted">
        貼り付けて「上映開始」を押すと、シーンに分割してコマ絵を生成します（Phase 0: 先頭 3 シーン）。
      </p>
      <Composer />
    </main>
  );
}
