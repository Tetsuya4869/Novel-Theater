import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Novel-Theater",
  description: "小説・文章を読みながらコマ絵・動画に変換する『観る読書』",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
