import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emits a minimal self-contained server bundle in .next/standalone.
  // This is what the Dockerfile will copy, so the image stays small.
  output: 'standalone',
};

export default nextConfig;
