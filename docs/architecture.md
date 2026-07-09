# Architecture

## System Overview

MajstorSada is a Nuxt/Firebase marketplace for urgent home-service requests in Belgrade. The system combines public SEO-focused routes with private operational surfaces for customers, tradespeople, and admins.

Public pages are server-rendered so service landing pages are crawlable and indexable. Private and functional areas are protected through application logic and are marked noindex so they do not appear in search results.

## High-Level Diagram

```text
Customer browser
  -> Firebase Hosting
     -> static assets from .output/public
     -> rewrite "**" to Nuxt SSR function
        -> Nuxt SSR server
           -> Firebase Auth
           -> Firestore
           -> Firebase Storage
           -> Firebase Cloud Messaging
           -> API Functions codebase

Firebase Functions codebases
  functions      -> api
  .output/server -> nuxt-ssr
```

## Firebase Deployment Model

The application deploys to Firebase Hosting and Firebase Functions.

- Hosting public directory: `.output/public`
- SSR function source: `.output/server`
- SSR function codebase: `nuxt-ssr`
- API function source: `functions`
- API function codebase: `api`
- Region: `europe-west3`

Firebase Hosting rewrites application traffic to the Nuxt SSR `server` function in `europe-west3`, while static assets are served from `.output/public`.

## Main Application Surfaces

- Public landing pages:
  - `/`
  - `/vodoinstalater`
  - `/elektricar`
  - `/bravar`
- Request submission flow:
  - `/zahtev`
  - `/potvrda`
- Client dashboard:
  - `/klijent/dashboard`
- Tradesperson surfaces:
  - `/majstor/dashboard`
  - `/majstor/login`
  - `/majstor/register`
  - `/majstor/forgot-password`
  - `/majstor/podesavanja`
  - `/majstor/recenzije`
- Admin surfaces:
  - `/admin/login`
  - `/admin/dashboard`
  - `/admin/klijent/[id]`
  - `/admin/majstor/[id]`

## Request Lifecycle

1. The customer selects a service category.
2. The customer submits a repair request.
3. The request is stored in Firestore.
4. Relevant available tradespeople can be notified or can see the job through the tradesperson surface.
5. A tradesperson accepts the intervention.
6. The customer and tradesperson agree directly on price, arrival, and work details before the job starts.

The system avoids fixed-time arrival guarantees. Its goal is to reduce manual calling and route a request to relevant available tradespeople.

## Data And Service Boundaries

- Firebase Auth handles identity and access for private areas.
- Firestore stores request, job, user, tradesperson, and operational state.
- Firebase Storage supports uploaded assets and request images.
- Firebase Cloud Messaging supports notifications to tradespeople.
- Firebase Functions provide controlled backend operations for workflows that should not be trusted to the client alone.

Private credentials and local service account files are not part of the repository and must remain local-only.

## SEO And Indexing Architecture

Nuxt SSR is used so public landing pages are rendered server-side and crawlable.

Indexable public routes include the homepage and service landing pages. Private, auth, dashboard, request, and confirmation routes are marked noindex through Nuxt route rules and Firebase Hosting headers.

SEO infrastructure includes:

- service-specific SSR landing pages
- canonical URLs
- `sitemap.xml`
- `robots.txt`
- noindex behavior for private and functional routes
- marketplace-safe structured data

Unsupported hardcoded ratings, price claims, and fixed-arrival guarantees are intentionally avoided.

## Deployment Safety

Production deployment is run through:

```bash
npm run deploy:prod
```

The deploy script is located at:

```text
tools/deploy-prod.ps1
```

The deploy flow:

1. Runs `npm run build`.
2. Stops if the build fails.
3. Verifies required `.output` artifacts exist.
4. Installs production dependencies inside `.output/server`.
5. Sets `FUNCTIONS_DISCOVERY_TIMEOUT=60` for Firebase Functions discovery reliability.
6. Deploys `firestore,storage,functions,hosting`.
7. Stops if Firebase deployment fails.

This avoids deploying stale or incomplete SSR artifacts after a failed build or failed dependency install.

## Operational Trade-Offs

Firebase is used to move quickly with managed infrastructure while keeping the system production-deployable. Nuxt SSR supports SEO for public acquisition pages, and Firestore fits the request/job state workflow.

As the product grows, the next engineering priorities are stronger matching and ranking, better monitoring, automated tests, analytics, and continued dependency/runtime maintenance.
