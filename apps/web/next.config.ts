import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // Self-contained server bundle for Docker. Without this Next.js ships
    // the full framework + every package in node_modules. With it, Next.js
    // traces actual imports and emits a curated server.js + minimal node_modules.
    output: 'standalone',
    // Monorepo-aware tracing root: tells Next to trace from the workspace
    // root, not just apps/web. Without this it emits unresolved-module
    // warnings and skips workspace deps.
    outputFileTracingRoot: path.join(__dirname, '../..'),
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'lh3.googleusercontent.com',
            },
            {
                protocol: 'https',
                hostname: 'polymarket-upload.s3.us-east-2.amazonaws.com',
            },
        ],
    },
};

export default nextConfig;
