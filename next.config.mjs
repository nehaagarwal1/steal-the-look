import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a verification build (NEXT_DIST_DIR=.next-build) run without
  // overwriting the files a running `next dev` is serving from .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A stray package-lock.json in the home folder made Next.js guess the wrong root.
  outputFileTracingRoot: projectRoot,
  images: {
    // YouCam returns result images on signed URLs; we render them with <img>, not next/image.
    unoptimized: true,
  },
};

export default nextConfig;
