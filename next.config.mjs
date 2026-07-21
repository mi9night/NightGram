import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  staticPageGenerationTimeout: 60,
  outputFileTracingRoot: projectRoot,
  output: "standalone",
  // TypeScript and ESLint run explicitly before the production build.
  // Keeping this avoids a duplicate type-check worker in constrained Windows builds.
  typescript: { ignoreBuildErrors: true },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
    cpus: 2,
    workerThreads: false,
  },
};

export default nextConfig;
