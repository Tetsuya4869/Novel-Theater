import type { ReactNode } from "react";
import "./globals.css";
import { getSession } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = {
  title: "Novel-Theater",
  description: "小説・文章を読みながらコマ絵・動画に変換する『観る読書』",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  return (
    <html lang="ja">
      <body>
        <SiteHeader user={session ? { name: session.name } : null} />
        {children}
      </body>
    </html>
  );
}
