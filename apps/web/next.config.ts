import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sigma/modelo", "@sigma/importador"],
  experimental: {
    // Archivos de Excel de hasta 4 MB (límite de cuerpo de las funciones de Vercel: 4.5 MB).
    serverActions: { bodySizeLimit: "5mb" },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
