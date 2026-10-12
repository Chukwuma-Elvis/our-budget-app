import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@node-rs/argon2"],
  turbopack: { root: path.resolve(__dirname) },
  async redirects() {
    return [
      {
        source: "/spending",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
