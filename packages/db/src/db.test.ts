import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
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

  it("get() が別インスタンスの新しい更新をディスクから取り込む（reader が worker 成果を見る）", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-db-get-"));
    const web = new FileWorkRepository(dir);
    const worker = new FileWorkRepository(dir);

    await web.save(makeStored("x", "u1", "public", 1));
    // web がロード後、worker が新しい版（likeCount 更新）を書く。
    const w = (await web.get("x"))!;
    expect(w.likeCount ?? 0).toBe(0);
    const fresh = await worker.get("x");
    fresh!.likeCount = 7;
    await worker.save(fresh!);

    // web.get はディスクを読み直して新しい版を返す（古いキャッシュを返さない）。
    expect((await web.get("x"))!.likeCount).toBe(7);
  });

  it("scanDisk は古いディスク版で新しいメモリ版を潰さない（updatedAt 調停）", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-db-merge-"));
    const repo = new FileWorkRepository(dir);
    const stored = makeStored("x", "u1", "public", 1);
    stored.likeCount = 5;
    await repo.save(stored); // updatedAt は save で現在時刻（=新しい）

    // 書き込み保留を模して、より古い updatedAt のファイルをディスクへ直接書く。
    const older = makeStored("x", "u1", "private", 1);
    older.updatedAt = 1;
    older.likeCount = 0;
    await writeFile(join(dir, "x.json"), JSON.stringify(older));

    // listAll の再走査は古いディスク版を採用せず、新しいメモリ版（likeCount 5）を保つ。
    const all = await repo.listAll();
    expect(all.find((s) => s.work.id === "x")!.likeCount).toBe(5);
  });
});
