import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "roliki.ua",
      },
      {
        protocol: "https",
        hostname: "neilavatar.com",
      },
    ],
  },
};

export default nextConfig;
