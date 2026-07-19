"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, logout } from "@/lib/client";

/**
 * サイト共通ヘッダー（Phase 4 §10）。
 * 開発用の軽量サインイン（表示名のみ）。ログイン状態に応じてライブラリ導線を出す。
 */
export function SiteHeader({ user }: { user: { name: string } | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogin() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await login(name.trim());
      setName("");
      router.refresh();
    } catch {
      setError("ログインに失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setBusy(true);
    setError(null);
    try {
      await logout();
      router.refresh();
    } catch {
      setError("ログアウトに失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="siteheader">
      <Link className="siteheader__brand" href="/">
        Novel-Theater
      </Link>
      <nav className="siteheader__nav">
        <Link href="/compose">投入</Link>
        <Link href="/gallery">ギャラリー</Link>
        {user && <Link href="/library">マイライブラリ</Link>}
      </nav>
      <div className="siteheader__auth">
        {error && (
          <span role="alert" style={{ color: "#ff8a8a", fontSize: "0.85rem" }}>
            {error}
          </span>
        )}
        {user ? (
          <>
            <span className="muted">{user.name}</span>
            <button className="btn btn--ghost btn--sm" onClick={onLogout} disabled={busy}>
              ログアウト
            </button>
          </>
        ) : (
          <form
            className="siteheader__login"
            onSubmit={(e) => {
              e.preventDefault();
              onLogin();
            }}
          >
            <input
              type="text"
              value={name}
              placeholder="表示名でログイン"
              onChange={(e) => setName(e.target.value)}
              aria-label="表示名"
              style={{ width: "10rem" }}
            />
            <button className="btn btn--sm" type="submit" disabled={busy || !name.trim()}>
              ログイン
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
