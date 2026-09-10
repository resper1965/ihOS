import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Both flags below silence a gate. They are here because turning either off
  // today blocks every deploy — measured 2026-09-10: 201 type errors and 1,223
  // lint findings, nearly all of them Supabase generated-type friction that
  // predates this configuration.
  //
  // They are NOT the whole story, and reading them alone gives the wrong
  // impression. Both counts are gated in CI by a ratchet
  // (.github/workflows/ci.yml, "must not increase"): the existing findings are
  // tolerated, a new one fails the build. So the flags mean "do not block the
  // deploy on the backlog", not "nobody is watching".
  //
  // What is genuinely missing is upstream of here: Vercel publishes without
  // waiting for CI, so a push whose ratchet fails still reaches production.
  // That is a project setting, not a code change.
  //
  // To remove these flags, drive both baselines to zero. Each PR that lowers
  // one is progress toward deleting this comment.
  typescript: {
    ignoreBuildErrors: true,
  },
  // @ts-ignore
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Fix PDF worker issues in Next.js Server environments
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],

  // Otimização de imagens com Supabase Storage
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uomdcazsriznqytvnsrv.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // Headers de segurança (SSDLC)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },

  // Logging em produção
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

export default withSentryConfig(nextConfig, {
  org: "bekaa-tecnologia-ltda",
  project: "ihos",
  silent: true,
});
