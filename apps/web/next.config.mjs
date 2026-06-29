/** @type {import('next').NextConfig} */
const nextConfig = {
  // ワークスペースの TS パッケージ（ソース）を Next にトランスパイルさせる。
  transpilePackages: [
    "@novel-theater/ai",
    "@novel-theater/config",
    "@novel-theater/core",
    "@novel-theater/db",
    "@novel-theater/queue",
    "@novel-theater/storage",
    "@novel-theater/types",
  ],
};

export default nextConfig;
