import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emits a minimal self-contained server bundle in .next/standalone.
  // This is what the Dockerfile will copy, so the image stays small.
  output: 'standalone',

  // Dev only. `next dev` serves its assets solely to the hostname it was
  // started on, and answers 403 to anything else — so opening the app on
  // 127.0.0.1:3000 instead of localhost:3000 loads the HTML but none of the
  // JavaScript, and the page silently never hydrates. Forms then fall back to
  // native submits, which for a password form means the password lands in the
  // URL. Ignored in production builds.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
