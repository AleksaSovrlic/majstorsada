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

## Client Authentication

Clients sign in at `/login` using a six-digit email OTP. The API validates the Turnstile challenge, reserves server-side sending quotas, and sends through Amazon SES in Frankfurt. The Google runtime identity exchanges its identity token for short-lived AWS credentials; no permanent AWS access key is used.

Successful OTP verification binds or provisions the verified client profile and returns a Firebase custom token. The browser exchanges it for a standard persisted Firebase Auth session. Existing verified clients retain their UID and business data; privileged or conflicting accounts cannot acquire a client token through this flow. Tradesperson and admin password sign-in remain separate and enabled.

The app limits reserved sending attempts to 500 per rolling 24 hours globally and three per email address, with the existing resend, expiry, wrong-code and IP/burst guards. These app controls do not cap manual SES activity or every Firebase/AWS charge. Valid issued OTP codes and existing sessions do not depend on a legacy email-link fallback.

The former `/finishLogin` path is an inert, noindex compatibility redirect to OTP. Retired client email-action queries are sanitized and Firebase codes are never consumed or forwarded by that path. Password-reset/email-verification handlers and Firebase reserved Auth paths remain outside the retirement handler. Firebase email-link sign-in is disabled while the email/password provider remains enabled for staff.

See the [production retirement report](otp-magic-link-retirement-report.md) for evidence and recovery boundaries.

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

OTP releases use the scoped procedure recorded in the [retirement report](otp-magic-link-retirement-report.md). The email-link setting is separate Identity Platform project configuration; a standard Firebase deploy does not change it. Do not re-enable it as an automatic UI rollback step.

## Operational Trade-Offs

Firebase is used to move quickly with managed infrastructure while keeping the system production-deployable. Nuxt SSR supports SEO for public acquisition pages, and Firestore fits the request/job state workflow.

As the product grows, the next engineering priorities are stronger matching and ranking, better monitoring, automated tests, analytics, and continued dependency/runtime maintenance.

## Account and Job Authorization

Role creation, job creation, acceptance and image publication are server-owned. Client contact is separate from feed data. Published job photos are served by an authenticated us-central1 function alongside the existing bucket; other functions remain in europe-west3. See [security boundaries](security-boundaries.md), [Blaze model](blaze-model.md), and the required [first release procedure](phase2-release.md).


## App Build Identity and Browser Recovery

Each `npm run build` creates a fresh Git-revision-plus-UUID app identity. The wrapper shares that identity across Nuxt config loads, then checks the Hosting manifest and baked SSR runtime identity. `ssr:refresh` uses the same wrapper while explicitly permitting reviewed SSR dependency-file changes.

A private `.output/build-receipt.json` records hashes of the reviewed frontend source/configuration, build environment and generated artifacts. It contains no dotenv values and sits outside both deployed sources. `npm run build:verify` rejects mixed SSR/Hosting artifacts, changed source or changed build configuration. Firebase predeploy runs the same guard for SSR and Hosting. A direct `nuxt build` or `nuxt generate` does not produce this deployable receipt.

The API health `BUILD_SHA` remains the source revision. It is independent of the unique frontend build identity, especially for scoped releases that update only selected API functions. Deployment checks must take the expected frontend ID from the local verified receipt and compare the exact Hosting latest manifest and dynamic SSR build marker; a prerendered homepage or the API health revision alone does not prove that SSR and Hosting agree.

The app uses Nuxt's existing outdated-build and lazy-chunk recovery. Static latest-manifest checks keep the existing hourly interval, and `latest.json` must revalidate its cache. Detection defers document reload until navigation; a missing lazy chunk can trigger navigation recovery with Nuxt's same-path reload guard. A user may need to re-enter unsent form text or a partially entered OTP after a document reload. The opaque OTP recovery receipt and persisted Firebase Auth session retain their existing storage behavior; codes and custom tokens are not added to storage.

Only the login component preloads the Turnstile script. Token execution still requires a deliberate submit and a fresh request-bound check. OTP custom-token completion shares the fresh-UID role lookup already started by Auth; other forced role refreshes remain unchanged. AWS transport initialization is deferred to an actual mail send and shared by concurrent sends in one warm instance. Verification does not initialize the AWS sender. Initialization failures are definitively unsent; actual send failures are never retried by this optimization.

## Client OTP Auth Storage Recovery

Firebase Auth can assign the expected user before rejecting a browser persistence write. For recognized storage errors, OTP completion retains only the exact token-bound User object and observed session state in memory for an explicit SDK retry. Decoding the custom-token UID binds that retry; it never authenticates the token or grants a role. Firebase sign-in and the server-owned client-role check must both succeed before navigation.

The retry does not send another email or repeat server OTP verification. Foreign session changes remain guarded, codes/custom tokens stay out of application storage, and no weaker persistence fallback is introduced. See the [implementation and regression evidence](otp-browser-storage-recovery-report.md) and [controlled production release](otp-browser-storage-deployment-report.md).
