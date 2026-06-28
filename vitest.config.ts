import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@novel-theater/config": r("./packages/config/src/index.ts"),
      "@novel-theater/types": r("./packages/types/src/index.ts"),
      "@novel-theater/core": r("./packages/core/src/index.ts"),
      "@novel-theater/storage": r("./packages/storage/src/index.ts"),
      "@novel-theater/ai": r("./packages/ai/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts"],
    environment: "node",
  },
});
