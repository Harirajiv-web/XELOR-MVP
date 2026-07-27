import type { NextConfig } from "next";

/**
 * The web app is a CLIENT of the API, never a second way into the database.
 *
 * It holds no database connection, no service-role credential and no business logic — a
 * rule worth stating in config because the alternative is available and tempting: Next can
 * talk to Postgres directly from a server component, and the first time somebody does that
 * they have bypassed the permission guard, the tenant fence, the audit trail and the
 * idempotency keys in one import. Everything goes through `/api/v1`.
 */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next's floating dev badge sits in the bottom-left corner, exactly on top of the
  // sidebar's Collapse control. Off — a development affordance that covers a real button
  // is worse than no affordance, and it appears in every screenshot of the product.
  devIndicators: false,
  // Type and lint errors fail the build. A UI that compiles with errors is a UI that ships
  // a blank column the day a backend field is renamed.
  typescript: { ignoreBuildErrors: false },
  // Linting runs as its own gate (`pnpm lint`), carrying the module-boundary rules that
  // make a module folder deletable. Next's built-in pass does not load that config, so
  // letting it run here would report a clean build while the rule that actually matters
  // went unchecked.
  eslint: { ignoreDuringBuilds: true },

  async rewrites() {
    // The browser calls same-origin `/api/v1/...`; Next forwards to the API. Two reasons,
    // and neither is convenience: it removes CORS from the problem entirely, and it means
    // the access token never has to be attached to a cross-origin request where a
    // misconfigured `Access-Control-Allow-Origin` would hand it to somebody else.
    return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // An ERP has no business being embedded, and no business reaching for a camera.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
