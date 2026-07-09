# MajstorSada

Production Nuxt/Firebase marketplace for urgent home-service requests in Belgrade.

MajstorSada is a solo-built marketplace product that helps customers submit one repair request instead of calling many individual tradespeople. A customer chooses a service category, sends a request, and the platform routes it to currently available verified tradespeople. The tradesperson who accepts the intervention contacts the customer directly to agree on price, arrival, and work details before the job starts.

## Live Demo

Live site: https://majstorsada.rs

Main public routes:

- `/`
- `/vodoinstalater`
- `/elektricar`
- `/bravar`

## Why This Project Matters

Urgent home repairs are stressful because customers often do not know who is available, who covers their type of problem, or how many phone numbers they will need to call before someone answers.

MajstorSada reduces that friction with a single request flow, service-specific landing pages, and operational tools for customers, tradespeople, and admins. The project demonstrates end-to-end ownership across product thinking, frontend implementation, Firebase backend services, SEO, deployment safety, and production operations.

## Core Features

- Public SEO landing pages for urgent services in Belgrade.
- Request submission flow for plumbing, electrical, locksmith, and general repair needs.
- Client, tradesperson, and admin surfaces.
- Firebase Auth-based access for private areas.
- Firestore-backed request and job state.
- Firebase Storage support for uploaded assets and request images.
- Push notification workflow for tradespeople via Firebase Cloud Messaging.
- Private route noindex strategy for dashboards, auth, request, and confirmation pages.
- Sitemap and robots configuration for controlled indexing.
- Hardened production deploy script with build and artifact checks.

## Tech Stack

- Nuxt 4
- Vue 3
- TypeScript
- Tailwind CSS
- Firebase Hosting
- Firebase Functions Gen 2
- Firestore
- Firebase Auth
- Firebase Storage
- Firebase Cloud Messaging
- Nuxt SEO, robots, sitemap, and schema modules

## Architecture

MajstorSada is deployed as a Nuxt SSR application on Firebase.

For more detail, see [docs/architecture.md](docs/architecture.md).

```text
Customer browser
  -> Firebase Hosting (.output/public)
  -> Hosting rewrite "**"
  -> Nuxt SSR function: server, region europe-west3, codebase nuxt-ssr

Firebase Functions codebases:
  functions      -> api
  .output/server -> nuxt-ssr
```

The Nuxt app is built with the Nitro Firebase preset. Firebase Hosting serves static public assets from `.output/public`, while all application routes are rewritten to the Nuxt SSR function.

The Firebase project uses two function codebases:

- `functions` as `api` for backend operations.
- `.output/server` as `nuxt-ssr` for the Nuxt SSR server.

Public SEO routes are indexable. Private and functional routes such as dashboards, login, request submission, and confirmation pages are marked noindex through route rules and Firebase Hosting headers.

## Request Lifecycle

1. Customer selects a service category.
2. Customer submits a repair request.
3. The request is stored and routed to relevant currently available tradespeople.
4. A tradesperson accepts the intervention and contacts the customer directly.
5. Price, arrival, and work details are agreed directly before work starts.

The product avoids fixed-time arrival guarantees. It focuses on reducing manual calling and connecting customers with available tradespeople faster.

## SEO And Indexing Strategy

The public landing pages are server-rendered for crawlability and target service-specific local search intent:

- urgent home repair in Belgrade
- plumber in Belgrade
- electrician in Belgrade
- locksmith in Belgrade

SEO infrastructure includes:

- canonical URLs on public landing pages
- `sitemap.xml`
- `robots.txt`
- noindex headers for private and functional routes
- marketplace-safe structured data
- removal of unsupported hardcoded rating and price claims

## Production Deployment

Production deployment is intentionally routed through a hardened script instead of a loose shell command.

Typical validation:

```bash
npm run build
```

Production deploy command:

```bash
npm run deploy:prod
```

The deploy script at `tools/deploy-prod.ps1` performs:

- Nuxt production build
- required `.output` artifact checks
- production dependency install inside `.output/server`
- `FUNCTIONS_DISCOVERY_TIMEOUT=60` for Firebase Functions discovery reliability
- Firebase deploy to `firestore,storage,functions,hosting`

The script is designed to stop on failed build, missing artifacts, failed install, or failed deploy.

## AI-Assisted Engineering Workflow

AI tools were used as engineering copilots during development for scoped audits, refactoring plans, SEO risk review, deployment checklists, and debugging support.

Final product decisions, architecture choices, copy, code changes, and production deployment decisions were reviewed and controlled manually. The product itself is not presented as AI-powered.

## Local Development

This project uses Volta to pin Node:

```text
Node 20.19.0
```

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Start the development server:

```bash
npm run dev
```

Local app URL:

```text
http://localhost:3333
```

Build for production:

```bash
npm run build
```

## Environment Variables

Use `.env.example` as the local setup reference.

The `NUXT_PUBLIC_*` Firebase values are public client-side Firebase configuration values. They are not private Firebase Admin credentials.

Never commit:

- `.env`
- `.env.production`
- Firebase service account keys
- `functions/.keys/serviceAccountKey.json`

Local Firebase Admin service account files must remain local-only.

## Current Limitations

- Automated test coverage is not yet included.
- Dependency and runtime maintenance is planned.
- Matching, ranking, and analytics can be improved.
- Operational verification processes need to keep evolving as the tradesperson network grows.

## Roadmap

- Improve request matching and ranking.
- Add analytics and conversion tracking.
- Expand operational dashboards.
- Add automated smoke tests.
- Continue dependency and Firebase runtime maintenance.
- Add more service and location landing pages.
