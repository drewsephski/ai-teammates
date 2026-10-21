import { withSentryConfig } from "@sentry/nextjs/config"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The proxy adds the nonce-based script policy to page responses.
          // Keep these protections on assets, redirects and API responses too.
          {
            key: "Content-Security-Policy",
            value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  // Limit HSTS to this HTTPS host; do not preload subdomains.
                  value: "max-age=31536000",
                },
              ]
            : []),
        ],
      },
      {
        source:
          "/:path(sign-in|sign-up|workspace|usage|memory|activity|chats|pricing|auth|api)/:rest*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Uploads source maps on production builds; without it the build still succeeds.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Railway builds have no .git to detect the commit from; locally this is unset and git HEAD is used.
  release: { name: process.env.RAILWAY_GIT_COMMIT_SHA },

  widenClientFileUpload: true,

  // Proxies browser events through the app so ad-blockers don't drop them.
  tunnelRoute: "/monitoring",

  silent: !process.env.CI,
})
