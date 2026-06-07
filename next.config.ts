import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
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
