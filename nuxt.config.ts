// https://nuxt.com/docs/api/configuration/nuxt-config
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
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
      },
      // The runtime for the SSR function. Without this the Firebase preset falls back to a
      // hardcoded "20" of its own (nitropack/dist/presets/firebase/utils.mjs), so the version
      // would live nowhere in this repo and changing `functions/package.json` alone would leave
      // the SSR function behind.
      //
      // The runtime version lives in exactly two places, one per codebase:
      //   - here, for the `nuxt-ssr` codebase
      //   - functions/package.json `engines.node`, for the `api` codebase
      // The toolchain version lives in one: `volta.node` in the root package.json, which
      // functions/ and the generated .output/server/package.json inherit via `volta.extends`.
      //
      // ROLLING BACK: reverting both numbers to "20" and redeploying works only until
      // 2026-10-30, when nodejs20 is decommissioned and firebase-tools' guardVersionSupport()
      // starts throwing instead of warning. After that date the rollback target is 22, not 20.
      //
      // On the move to Node 24 we compared the generated SSR lockfile under npm 10.8.2 and
      // npm 11.16.0 and found an identical tree. That measured structure, not behaviour: it
      // says no new packages arrive with the newer tool, not that the existing ones behave the
      // same on the newer runtime. Only a deploy shows that.
      nodeVersion: '24'
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
  hooks: {
    // Registered through `nitro:init` rather than `nitro.hooks` in this config: a `compiled`
    // entry there REPLACES the preset's own hook of that name, which silently skips
    // `updatePackageJSON` and strips `main` and `engines.node` from the generated package.json.
    // Hooking the instance is additive and runs after the preset's, which is what we need.
    'nitro:init' (nitro) {
      nitro.hooks.hook('compiled', () => {
        // Prerendering spins up a second Nitro instance with its own output dir and no
        // generated package.json. Only the real server build is ours to police.
        if (nitro.options.preset === 'nitro-prerender') {
          return
        }

        const pkgPath = join(nitro.options.output.serverDir, 'package.json')
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
        const deps: Record<string, string> = pkg.dependencies || {}

        // The preset defaults firebase-admin and firebase-functions to "latest"
        // (nitropack/dist/presets/firebase/utils.mjs), which re-resolves on every deploy and
        // makes the SSR runtime non-deterministic. Nitro overrides that default with the exact
        // installed version for anything the bundle actually pulls in, so both are governed by
        // the committed root lockfile instead.
        //
        // This hook never invents a version. A package still sitting at "latest" means nothing
        // traced it, so it is dead weight the preset added on spec: drop it. Anything else that
        // is still unpinned is a mistake we refuse to ship.
        for (const [name, version] of Object.entries(deps)) {
          if (version === 'latest') {
            delete deps[name]
            nitro.logger.info(`SSR dependency "${name}" was untraced and unpinned - removed`)
          }
        }

        // Volta resolves its toolchain from the nearest package.json, and this generated one has
        // no pin of its own - so anyone running npm by hand in .output/server gets Volta's global
        // default instead of the project's. `npm run` is unaffected because it puts the resolved
        // node binary on PATH ahead of the shims, which is why deploys were always consistent and
        // only manual invocations drifted. Inheriting keeps the version in the root package.json
        // alone rather than repeating the number here.
        pkg.volta = { extends: '../../package.json' }

        pkg.dependencies = deps
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

        // The preset writes these; losing them would leave Cloud Build without an entry point
        // and without a pinned runtime. Fail loudly rather than deploy a package.json like that.
        for (const field of ['main', 'engines'] as const) {
          if (!pkg[field]) {
            throw new Error(
              `The generated SSR package.json is missing "${field}". The Firebase preset's own `
              + 'compiled hook did not run - check that this hook is registered additively.'
            )
          }
        }

        nitro.logger.info(`SSR dependencies pinned: ${Object.keys(deps).length} packages, node ${pkg.engines.node}`)
      })
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
    // The four public pages carry no server data: their scripts hold only `definePageMeta`,
    // `useSeoMeta` and literal arrays, and the role-dependent part of PublicHeader sits inside
    // `<ClientOnly>`, so server output cannot vary with auth state. Prerendering them means
    // Hosting serves static files instead of invoking the SSR function for every visitor.
    // Nitro merges these into the same route set as `nitro.prerender.routes` (core/index.mjs).
    '/vodoinstalater': {
      prerender: true,
      sitemap: {
        changefreq: 'weekly',
        priority: 0.9
      }
    },
    '/elektricar': {
      prerender: true,
      sitemap: {
        changefreq: 'weekly',
        priority: 0.9
      }
    },
    '/bravar': {
      prerender: true,
      sitemap: {
        changefreq: 'weekly',
        priority: 0.9
      }
    },
    '/': {
      prerender: true,
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
