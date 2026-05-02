import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.vusercontent.net", "*.vercel.run"],
  // ChatSDK's Discord adapter pulls in discord.js, which has optional native
  // deps (zlib-sync, bufferutil, utf-8-validate) that Turbopack tries to bundle
  // and fails on. These packages are server-only — let Node require() them at
  // runtime instead of forcing the bundler to resolve them.
  serverExternalPackages: [
    "chat",
    "@chat-adapter/discord",
    "@chat-adapter/state-memory",
    "discord.js",
    "@discordjs/ws",
    "@discordjs/rest",
    "@discordjs/util",
    "@discordjs/collection",
    "@discordjs/builders",
    "zlib-sync",
    "bufferutil",
    "utf-8-validate",
  ],
};

export default nextConfig;
