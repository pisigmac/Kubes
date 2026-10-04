import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native addon. Must stay external or the App Router bundles it and it fails to load.
  serverExternalPackages: ["better-sqlite3"],
  // Dev HMR and the RSC debug channel reject 127.0.0.1 unless it is listed.
  // Without this, Chrome on that host never finishes hydration.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
