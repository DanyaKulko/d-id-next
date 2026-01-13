import type {NextConfig} from "next";

const nextConfig: NextConfig = {
    /* config options here */
    reactCompiler: true,
    output: 'standalone',
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
