import { readFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];
export default {
  poweredByHeader: false,
  // Penanda versi agar mudah memastikan deploy terbaru yang aktif (tampil di login dan sidebar).
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version, NEXT_PUBLIC_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) },
  reactStrictMode: true,
  // Impor anggaran menerima berkas hingga 5 MB; batas bawaan server action hanya 1 MB.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() { return [{ source: "/:path*", headers: securityHeaders }]; },
};
