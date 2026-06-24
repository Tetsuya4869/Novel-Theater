// 現在ロケーションに対応するサイトアダプタを解決する。
import type { SiteAdapter } from './SiteAdapter';
import { narouAdapter } from './narou';
import { kakuyomuAdapter } from './kakuyomu';

export const adapters: SiteAdapter[] = [narouAdapter, kakuyomuAdapter];

export function adapterFor(loc: Location = location): SiteAdapter | null {
  return adapters.find((a) => a.matches(loc)) ?? null;
}
