// https://nuxt.com/docs/api/configuration/nuxt-config
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SITE_URL = (process.env.NUXT_PUBLIC_SITE_URL || 'https://majstorsada.rs').replace(/\/+$/, '')

// The Git commit this build was produced from. Surfaces publicly in two places:
//   - `_nuxt/builds/latest.json` (static, served by Hosting)
//   - the `builds/meta/<buildId>.json` preload link in server-rendered HTML (served by the SSR function)
// Deliberately has no fallback: a production build that cannot identify itself must not be produced,
// because a placeholder would make every probe agree and the post-deploy check pass on nothing.
// `nuxt build` sets NODE_ENV=production before loading this config, `nuxt dev` sets development.
function resolveBuildId (): string {
  if (process.env.NODE_ENV === 'development') {
    return 'dev'
  }
  try {
    const git = (args: string) =>
      execSync(`git ${args}`, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const sha = git('rev-parse --short HEAD')
    return git('status --porcelain') ? `${sha}-dirty` : sha
  } catch (error) {
    throw new Error(
      'Cannot resolve the Git commit for buildId. A production build that cannot identify itself must not be deployed. '
      + `Original error: ${(error as Error).message}`
    )
  }
}

const BUILD_ID = resolveBuildId()

export default defineNuxtConfig({
  srcDir: 'app',
  alias: {
    '@': join(__dirname, 'app')
  },
  compatibilityDate: '2025-07-15',
  // Replaces Nuxt's random per-build UUID, so the deployed build names its own commit.
  buildId: BUILD_ID,
  // Production safety: disable Nuxt DevTools in prod builds
  devtools: { enabled: false },
  site: {
    url: SITE_URL,
    name: 'MajstorSada',
    description: 'Brze i pouzdane usluge majstora u vašem kraju.',
    defaultLocale: 'sr-RS',
    currentLocale: 'sr-RS',
    trailingSlash: false
  },
  css: ['~/assets/css/tailwind.css'],
  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    // Phase 1 SEO infrastructure (explicit modules for maximum control)
    '@nuxtjs/robots',
    '@nuxtjs/sitemap',
    'nuxt-schema-org'
  ],
  nitro: {
    preset: 'firebase',
    firebase: {
      gen: 2,
      httpsOptions: {
        region: 'europe-west3'
      }
    },
    prerender: {
      // Firebase Hosting can serve these as static files; keep crawlers fast and reduce SSR load.
      // - robots.txt is already prerendered by @nuxtjs/robots (Firebase limitation)
      // - sitemap.xml is prerendered here to guarantee a static artifact in `.output/public`
      routes: ['/sitemap.xml']
    },
    // Firebase Gen2 (Cloud Run) runtime safety: bundle these to avoid module-resolution crashes
    externals: {
      inline: ['pinia', '@vue/devtools-api']
    }
  },
  app: {
    head: {
      htmlAttrs: {
        lang: 'sr-RS'
      },
      title: 'MajstorSada',
      titleTemplate: '%s | MajstorSada',
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        // Favicons (SERP + browsers)
        { rel: 'icon', href: '/favicon.ico' },
        { rel: 'icon', href: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
        { rel: 'icon', href: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
        // iOS (prevents 404; PWA behavior remains driven by manifest)
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '192x192' }
      ],
      meta: [
        {
          name: 'description',
          content: 'Brze i pouzdane usluge majstora u vašem kraju.'
        },
        { name: 'google-site-verification', content: 'YVa8U-X1G280zhVcp1iy13yH2jwZXVHABrPtB4jOkoM' },
        { name: 'theme-color', content: '#f8fafc' },
        // Modern (Chrome/Android legacy) web-app capability hint.
        // Keeps console clean when `apple-mobile-web-app-capable` is present.
        { name: 'mobile-web-app-capable', content: 'yes' },
        // iOS legacy support (still required on some iOS versions for standalone mode).
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }
      ]
    }
  },
  sitemap: {
    // We intentionally keep sitemap lean: only indexable routes will appear.
    // Filtering is enforced via `robots` + `routeRules` (single source of truth).
    // Since we only have static sources right now, ship sitemap as a prerendered file and
    // tree-shake runtime sitemap generation code from the server bundle.
    zeroRuntime: true
  },
  robots: {
    // No legacy robots.txt merge - this module is the source of truth.
    mergeWithRobotsTxtPath: false,
    sitemap: [`${SITE_URL}/sitemap.xml`],
    groups: [
      {
        userAgent: ['*'],
        disallow: ['/admin', '/majstor', '/klijent', '/login', '/finishLogin']
      }
    ]
  },
  schemaOrg: {
    identity: {
      type: 'Organization',
      name: 'MajstorSada',
      url: SITE_URL,
      // Relative paths are resolved against the canonical host via nuxt-site-config.
      logo: '/icons/icon-512.png'
    }
  },
  routeRules: {
    // Non-indexable routes (Phase 1).
    // NOTE: These affect the X-Robots-Tag header + robots meta injection via @nuxtjs/robots,
    // and sitemap filtering via @nuxtjs/sitemap (it excludes non-indexable routes automatically).
    '/admin/**': { robots: false },
    '/majstor/**': { robots: false },
    '/klijent/**': { robots: false },
    '/login': { robots: false },
    '/finishLogin': { robots: false },
    '/zahtev': { robots: false },
    '/potvrda': { robots: false },
    '/vodoinstalater': {
      sitemap: {
        changefreq: 'weekly',
        priority: 0.9
      }
    },
    '/elektricar': {
      sitemap: {
        changefreq: 'weekly',
        priority: 0.9
      }
    },
    '/bravar': {
      sitemap: {
        changefreq: 'weekly',
        priority: 0.9
      }
    },
    '/': {
      sitemap: {
        changefreq: 'weekly',
        priority: 1.0
      }
    }
  },
  runtimeConfig: {
    public: {
      // Canonical public origin (used for Auth email links / deep links in production).
      // Set NUXT_PUBLIC_SITE_URL to override (e.g. staging). Defaults to branded domain.
      siteUrl: SITE_URL,
      firebase: {
        apiKey: process.env.NUXT_PUBLIC_FIREBASE_API_KEY || 'demo-api-key',
        authDomain: process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'localhost',
        projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID || 'majstorsada-b2ad4',
        appId: process.env.NUXT_PUBLIC_FIREBASE_APP_ID || 'demo-app-id',
        messagingSenderId: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
        storageBucket: process.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'demo-bucket',
        measurementId: process.env.NUXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-DEMO123',
        functionsRegion: process.env.NUXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west3',
      },
      // Keep VAPID key outside nested firebase object to match current types
      firebaseVapidKey: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_VAPID_KEY || '',
      // Mapbox public token (used by client-side Geocoding autocomplete)
      mapboxToken: process.env.NUXT_PUBLIC_MAPBOX_TOKEN || ''
    }
  }
})
