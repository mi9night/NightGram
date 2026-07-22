import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const isVercel = process.env.VERCEL === "1";

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  staticPageGenerationTimeout: 60,

  outputFileTracingRoot: projectRoot,

  // Standalone нужен для Windows/PWA runtime,
  // но Vercel использует собственный формат развертывания.
  ...(isVercel ? {} : { output: "standalone" }),

  typescript: {
    ignoreBuildErrors: true,
  },

  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },

  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
    cpus: 2,
    workerThreads: false,
  },
};

export default nextConfig;