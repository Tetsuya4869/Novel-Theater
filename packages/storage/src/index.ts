import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface StoredObject {
  /** 配信用 URL（公開ベース URL + key）。 */
  url: string;
  /** ストレージ内の論理キー。 */
  key: string;
}

/**
 * オブジェクトストレージの抽象（§6）。生成メディアは URL 参照で扱い、
 * DB にはメタのみを保存する。Phase 0 はローカルディスク実装。
 * Phase 1+ で S3 互換（R2/MinIO）+ 署名付き URL に差し替える。
 */
export interface Storage {
  readonly id: string;
  put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject>;
  /** 署名付き URL（Phase 0 は公開 URL をそのまま返す）。 */
  signedUrl(key: string, ttlSeconds?: number): Promise<string>;
}

export interface LocalStorageOptions {
  /** バイト列を書き出すローカルディレクトリ。 */
  baseDir: string;
  /**
   * 返す URL の接頭辞。
   * - Web: "/generated"（Next の public 配下を静的配信）
   * - CLI: ファイルパスやそのまま baseDir を指定
   */
  publicBaseUrl: string;
}

/** 開発用のローカルディスクストレージ。 */
export class LocalStorage implements Storage {
  readonly id = "local";
  private readonly baseDir: string;
  private readonly publicBaseUrl: string;

  constructor(opts: LocalStorageOptions) {
    this.baseDir = resolve(opts.baseDir);
    this.publicBaseUrl = opts.publicBaseUrl.replace(/\/$/, "");
  }

  async put(key: string, data: Uint8Array, _contentType: string): Promise<StoredObject> {
    const safeKey = key.replace(/^\/+/, "");
    const filePath = join(this.baseDir, safeKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return { url: `${this.publicBaseUrl}/${safeKey}`, key: safeKey };
  }

  async signedUrl(key: string): Promise<string> {
    return `${this.publicBaseUrl}/${key.replace(/^\/+/, "")}`;
  }
}
