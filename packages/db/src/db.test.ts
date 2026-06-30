import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Work } from "@novel-theater/types";
import { FileWorkRepository, InMemoryWorkRepository, type StoredWork, type WorkRepository } from "./index";

function makeWork(id: string, visibility: Work["visibility"] = "private"): Work {
  return {
    id,
    title: id,
    sourceText: "本文",
    language: "ja",
    visibility,
    contentHash: `hash-${id}`,
    settings: { style: "manga", panelDensity: "medium", videoLevel: "none", narration: false },
    scenes: [],
  };
}

function makeStored(id: string, ownerId: string | undefined, visibility: Work["visibility"], createdAt: number): StoredWork {
  return {
    work: makeWork(id, visibility),
    ownerId,
    costSpentUSD: 0,
    capUSD: 1,
    capReached: false,
    createdAt,
    updatedAt: createdAt,
  };
}

function runListingSpec(name: string, factory: () => Promise<WorkRepository>) {
  describe(name, () => {
    it("listByUser/listPublic/listAll を新しい順で返す", async () => {
      const repo = await factory();
      await repo.save(makeStored("a", "u1", "private", 100));
      await repo.save(makeStored("b", "u1", "public", 300));
      await repo.save(makeStored("c", "u2", "public", 200));

      const mine = await repo.listByUser("u1");
      expect(mine.map((s) => s.work.id)).toEqual(["b", "a"]); // 新しい順

      const pub = await repo.listPublic();
      expect(pub.map((s) => s.work.id)).toEqual(["b", "c"]);

      const all = await repo.listAll();
      expect(all.map((s) => s.work.id)).toEqual(["b", "c", "a"]);
    });

    it("findByContentHash で再投入を引き当てる", async () => {
      const repo = await factory();
      await repo.save(makeStored("a", "u1", "private", 1));
      expect((await repo.findByContentHash("hash-a"))?.work.id).toBe("a");
      expect(await repo.findByContentHash("none")).toBeUndefined();
    });
  });
}

runListingSpec("InMemoryWorkRepository", async () => new InMemoryWorkRepository());
runListingSpec("FileWorkRepository", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nt-db-"));
  return new FileWorkRepository(dir);
});

describe("FileWorkRepository 別プロセス連携", () => {
  it("別インスタンスが書いた作品を listAll が再走査で取り込む（worker 用）", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-db-shared-"));
    const web = new FileWorkRepository(dir);
    const worker = new FileWorkRepository(dir);

    // worker 側を一度ロードしておく（loaded=true）。
    expect(await worker.listAll()).toEqual([]);

    // web 側が新規作品を書く。
    await web.save(makeStored("x", "u1", "public", 1));

    // worker 側はキャッシュ済みでも listAll でディスクを再走査して取り込む。
    const all = await worker.listAll();
    expect(all.map((s) => s.work.id)).toEqual(["x"]);
  });
});
