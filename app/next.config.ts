import type { NextConfig } from 'next';

const config: NextConfig = {
  // The shared workspace package ships TypeScript source.
  transpilePackages: ['@oth/shared'],
  // Keypair files and node:sqlite never reach the browser; API routes run on the Node runtime.
  serverExternalPackages: [],
};

export default config;
