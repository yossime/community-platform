/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@platform/ui', '@platform/api'],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    outputFileTracingRoot: require('path').join(__dirname, '../../'),
    outputFileTracingIncludes: {
      '/api/**': ['../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/*'],
      '/*': ['../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/*'],
    },
    serverActions: { bodySizeLimit: '2mb' },
    optimizePackageImports: [
      '@platform/ui',
      'lucide-react',
      '@tiptap/react',
      '@tiptap/starter-kit',
    ],
  },

  // Security and caching headers
  headers: async () => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3002';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || '';
    const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || '';
    const sentryOrigin = sentryDsn ? new URL(sentryDsn).origin : '';

    // Build CSP — strict, single-origin (Netfree compatible)
    const isDev = process.env.NODE_ENV === 'development';
    const csp = [
      "default-src 'self'",
      `script-src 'self'${isDev ? " 'unsafe-eval'" : ""} 'unsafe-inline'`, // unsafe-eval only in dev
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: blob: ${supabaseUrl}`,
      `font-src 'self'`,
      `connect-src 'self' ${supabaseUrl} ${wsUrl} ${posthogHost} ${sentryOrigin}`,
      `frame-src 'self'`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
          {
            key: 'Content-Security-Policy',
            value: csp,
          },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // Webpack optimizations
  webpack: (config) => {
    // Tree-shake Lucide icons — alias to ESM entry for better dead-code elimination
    config.resolve.alias = {
      ...config.resolve.alias,
      'lucide-react': 'lucide-react/dist/esm/icons',
    };
    return config;
  },
};

const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  hideSourceMaps: true,
  automaticVercelMonitors: true,
});
