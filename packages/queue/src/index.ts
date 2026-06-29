/**
 * 非同期ジョブキューの抽象（PLAN.md §6 / Phase 1）。
 *
 * Phase 1 の既定はインプロセスのワーカープール（同一プロセス内で並列実行）。
 * これが「キュー＋ワーカー」の最小実装であり、`JobQueue` interface が
 * 本番（BullMQ + Redis、別プロセスの apps/worker への切り出し）への seam になる。
 */

export type JobStatus = "queued" | "active" | "completed" | "failed";

export interface JobHandle {
  id: string;
  status: JobStatus;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface AddJobOptions {
  /** 冪等キー。同一 id がキュー/実行中/完了済みなら再追加しない。 */
  id: string;
  /** 小さいほど優先（現在地に近いシーンを先に）。 */
  priority?: number;
  run: () => Promise<void>;
}

export interface JobQueue {
  /** ジョブを投入し jobId を返す（既存 id なら既存ハンドルの id）。 */
  add(opts: AddJobOptions): string;
  get(id: string): JobHandle | undefined;
  has(id: string): boolean;
  stats(): { queued: number; active: number; completed: number; failed: number };
}

interface InternalJob {
  handle: JobHandle;
  priority: number;
  run: () => Promise<void>;
}

export interface InProcessJobQueueOptions {
  concurrency?: number;
}

/** 並列度を制限したインプロセス・ワーカープール。 */
export class InProcessJobQueue implements JobQueue {
  private readonly concurrency: number;
  private readonly handles = new Map<string, JobHandle>();
  private readonly pending: InternalJob[] = [];
  private active = 0;
  private idleWaiters: Array<() => void> = [];

  constructor(opts: InProcessJobQueueOptions = {}) {
    this.concurrency = Math.max(1, opts.concurrency ?? 3);
  }

  add(opts: AddJobOptions): string {
    const existing = this.handles.get(opts.id);
    if (existing) return existing.id; // 冪等

    const handle: JobHandle = { id: opts.id, status: "queued", createdAt: Date.now() };
    this.handles.set(opts.id, handle);
    this.pending.push({ handle, priority: opts.priority ?? 0, run: opts.run });
    this.pending.sort((a, b) => a.priority - b.priority);
    this.pump();
    return opts.id;
  }

  get(id: string): JobHandle | undefined {
    return this.handles.get(id);
  }

  has(id: string): boolean {
    return this.handles.has(id);
  }

  stats() {
    let queued = 0;
    let active = 0;
    let completed = 0;
    let failed = 0;
    for (const h of this.handles.values()) {
      if (h.status === "queued") queued++;
      else if (h.status === "active") active++;
      else if (h.status === "completed") completed++;
      else failed++;
    }
    return { queued, active, completed, failed };
  }

  /** すべてのジョブが終了するまで待つ（テスト・バッチ用）。 */
  onIdle(): Promise<void> {
    if (this.active === 0 && this.pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift()!;
      this.active++;
      job.handle.status = "active";
      job.handle.startedAt = Date.now();
      void job
        .run()
        .then(() => {
          job.handle.status = "completed";
        })
        .catch((err) => {
          job.handle.status = "failed";
          job.handle.error = err instanceof Error ? err.message : String(err);
        })
        .finally(() => {
          job.handle.finishedAt = Date.now();
          this.active--;
          this.pump();
          if (this.active === 0 && this.pending.length === 0) {
            const waiters = this.idleWaiters;
            this.idleWaiters = [];
            for (const w of waiters) w();
          }
        });
    }
  }
}
