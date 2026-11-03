import type { NextConfig } from "next";
import path from "node:path";

const bot = process.env.BOT_URL || "http://127.0.0.1:3000";

const nextConfig: NextConfig = {
  // The repo root also has a bun.lock; pin the workspace root to this app.
  turbopack: { root: path.resolve(__dirname) },
  // Agent rules live in the repo-root CLAUDE.md. Do not emit web/AGENTS.md.
  agentRules: false,
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "0.0.0.0",
    "grok.com",
    "*.grok.com",
    "*.x.ai",
  ],
  // Same-origin proxy so the preview browser can read the bot without
  // calling a private port. SSE query strings are forwarded.
  async rewrites() {
    return [
      { source: "/snapshot", destination: `${bot}/snapshot` },
      { source: "/events", destination: `${bot}/events` },
      { source: "/tape", destination: `${bot}/tape` },
      { source: "/history", destination: `${bot}/history` },
      { source: "/binance", destination: `${bot}/binance` },
      { source: "/live", destination: `${bot}/live` },
    ];
  },
};

export default nextConfig;
