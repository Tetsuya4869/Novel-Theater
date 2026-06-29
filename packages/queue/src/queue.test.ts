import { describe, it, expect } from "vitest";
import { InProcessJobQueue } from "./index";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("InProcessJobQueue", () => {
  it("並列度を超えない", async () => {
    const q = new InProcessJobQueue({ concurrency: 2 });
    let active = 0;
    let maxActive = 0;
    const make = () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await tick();
      active--;
    };
    for (let i = 0; i < 6; i++) q.add({ id: `j${i}`, run: make() });
    await q.onIdle();
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(q.stats().completed).toBe(6);
  });

  it("優先度の小さいジョブを先に実行する", async () => {
    const q = new InProcessJobQueue({ concurrency: 1 });
    const order: number[] = [];
    q.add({ id: "a", priority: 5, run: async () => void order.push(5) });
    q.add({ id: "b", priority: 1, run: async () => void order.push(1) });
    q.add({ id: "c", priority: 3, run: async () => void order.push(3) });
    await q.onIdle();
    // 最初の a は即実行され得るが、残りは優先度順。先頭以降が昇順であることを確認。
    expect(order.slice(1)).toEqual([...order.slice(1)].sort((x, y) => x - y));
  });

  it("同一 id は冪等（再追加しない）", async () => {
    const q = new InProcessJobQueue({ concurrency: 1 });
    let runs = 0;
    const run = async () => {
      runs++;
      await tick();
    };
    q.add({ id: "dup", run });
    q.add({ id: "dup", run });
    await q.onIdle();
    expect(runs).toBe(1);
    expect(q.has("dup")).toBe(true);
  });

  it("失敗ジョブを failed として記録する", async () => {
    const q = new InProcessJobQueue({ concurrency: 1 });
    q.add({ id: "boom", run: async () => { throw new Error("x"); } });
    await q.onIdle();
    expect(q.get("boom")?.status).toBe("failed");
    expect(q.get("boom")?.error).toBe("x");
  });
});
