import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@lapsignal/contracts", "@lapsignal/design-system", "@lapsignal/telemetry-domain"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
    workerThreads: true
  }
};

export default nextConfig;
