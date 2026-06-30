import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { StoryBible, Work } from "@novel-theater/types";

/**
 * 永続化レイヤ（PLAN.md §8 / Phase 1）。
 * StoredWork は Work 本体＋コスト/上限などの運用メタ。
 * Phase 1 既定は FileWorkRepository（ディスク永続・content_hash 索引）。
 * 本番は同 interface の PrismaWorkRepository（Postgres）へ差し替える
 * （スキーマは packages/db/prisma/schema.prisma を参照）。
 */
export interface StoredWork {
  work: Work;
  /** 一貫性エンジン（Story Bible）。Phase 3 で構築（§7.4）。 */
  bible?: StoryBible;
  /** これまでに生成に要した USD 累計。 */
  costSpentUSD: number;
  /** 1 作品あたりのコスト上限（USD）。 */
  capUSD: number;
  /** 上限到達フラグ（UI バナー表示に使用）。 */
  capReached: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WorkRepository {
  save(stored: StoredWork): Promise<void>;
  get(id: string): Promise<StoredWork | undefined>;
  /** 同一テキスト＋設定の再投入をキャッシュヒットさせる（§8.3）。 */
  findByContentHash(hash: string): Promise<StoredWork | undefined>;
}

/** メモリ内リポジトリ（テスト・揮発用途）。 */
export class InMemoryWorkRepository implements WorkRepository {
  private readonly byId = new Map<string, StoredWork>();
  private readonly byHash = new Map<string, string>();

  async save(stored: StoredWork): Promise<void> {
    stored.updatedAt = Date.now();
    this.byId.set(stored.work.id, stored);
    this.byHash.set(stored.work.contentHash, stored.work.id);
  }
  async get(id: string): Promise<StoredWork | undefined> {
    return this.byId.get(id);
  }
  async findByContentHash(hash: string): Promise<StoredWork | undefined> {
    const id = this.byHash.get(hash);
    return id ? this.byId.get(id) : undefined;
  }
}

/**
 * ディスク永続のリポジトリ。`<dir>/<workId>.json` に StoredWork を書き出し、
 * content_hash → workId の索引を保持する。書き込みは直列化して破損を避ける。
 * （Phase 1 の検証用。本番は Postgres + オブジェクトストレージ。）
 */
export class FileWorkRepository implements WorkRepository {
  private readonly dir: string;
  private readonly cache = new Map<string, StoredWork>();
  private readonly hashIndex = new Map<string, string>();
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(dir: string) {
    this.dir = resolve(dir);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!existsSync(this.dir)) return;
    const files = await readdir(this.dir);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(this.dir, f), "utf8");
        const stored = JSON.parse(raw) as StoredWork;
        this.cache.set(stored.work.id, stored);
        this.hashIndex.set(stored.work.contentHash, stored.work.id);
      } catch {
        // 壊れたファイルは無視する。
      }
    }
  }

  async save(stored: StoredWork): Promise<void> {
    await this.ensureLoaded();
    stored.updatedAt = Date.now();
    this.cache.set(stored.work.id, stored);
    this.hashIndex.set(stored.work.contentHash, stored.work.id);
    const path = join(this.dir, `${stored.work.id}.json`);
    const data = JSON.stringify(stored);
    // 直列化して同一ファイルへの同時書き込みを避ける。
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(this.dir, { recursive: true });
      await writeFile(path, data);
    });
    await this.writeChain;
  }

  async get(id: string): Promise<StoredWork | undefined> {
    await this.ensureLoaded();
    return this.cache.get(id);
  }

  async findByContentHash(hash: string): Promise<StoredWork | undefined> {
    await this.ensureLoaded();
    const id = this.hashIndex.get(hash);
    return id ? this.cache.get(id) : undefined;
  }
}
