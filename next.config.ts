import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // The sandbox preview proxies the dev server under a *.e2b.app host, so
  // that origin has to be allowed or Next blocks its dev requests.
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
};

export default nextConfig;
