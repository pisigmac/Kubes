import type { NextConfig } from "next";

// Strip empty string environment variables that cause @ai-sdk/openai validateBaseURL crashes
if (process.env.OPENAI_BASE_URL?.trim() === "") {
  delete process.env.OPENAI_BASE_URL;
}
if (process.env.OPENAI_API_KEY?.trim() === "") {
  delete process.env.OPENAI_API_KEY;
}

const nextConfig: NextConfig = {
  // Native addon. Must stay external or the App Router bundles it and it fails to load.
  serverExternalPackages: ["better-sqlite3"],
  // Dev HMR and the RSC debug channel reject 127.0.0.1 unless it is listed.
  // Without this, Chrome on that host never finishes hydration.
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
};


export default nextConfig;
