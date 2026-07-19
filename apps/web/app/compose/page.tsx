import Link from "next/link";
import { Composer } from "@/components/composer/Composer";
import { maxInputChars } from "@/lib/services";

export const runtime = "nodejs";

export default function ComposePage() {
  return (
    <main className="container">
      <p>
        <Link href="/">← トップ</Link>
      </p>
      <h1>テキストを投入</h1>
      <p className="muted">
        貼り付けて「上映開始」を押すと、シーンごとにコマ絵を順次生成します。生成は読み進めに合わせて先読みされます。
      </p>
      <Composer maxChars={maxInputChars()} />
    </main>
  );
}
