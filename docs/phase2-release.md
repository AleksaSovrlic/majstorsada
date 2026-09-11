# Phase 2 coordinated release

Status: deployed to production on 2026-09-11 after explicit owner approval. This is an incompatible job-schema and authorization change. Deploy matching UI, API and rules together. The first-release cleanup covered only three reviewed test jobs and two photos. It does not authorize deleting subsequently created jobs. Accounts were retained.

## Production verification, 2026-09-11

- The new feed index reached READY before writes were enabled. Published Firestore/Storage rules, API functions, SSR and Hosting were released together using a temporary write gate.
- The reviewed three legacy test jobs and two photos were removed. Original client/tradesperson/admin profiles, avatars, token balances and existing rating aggregates were retained.
- Real production Auth/Firestore/Storage/Functions checks passed: zero-token registration, idempotent job creation, private contact rules, JPEG upload/finalization, authenticated image bytes, feed query, zero-token acceptance rejection, one debit on acceptance/retry, assigned-only contact, completion and rating.
- Test identities used reserved example.invalid addresses; verified email and one temporary token were test fixtures. No real email, SMS or push was sent. There were no existing available tradespeople in the test trade, and test profiles remained unavailable. All temporary Auth accounts, job documents, contacts and images were removed afterward.
- Final comparison confirmed all original profile documents unchanged (one admin, three clients, two tradespeople), zero remaining jobs/job photos and zero temporary test Auth accounts. Published rule contents exactly match local source. The reviewed runtime error log contained only the expected 503 from testing the closed write gate.
- Headless browser checks on the live domain passed for home, client login and tradesperson login without unhandled page errors. The owner subsequently reported that the requested manual live checks passed.
- Hosting, SSR and API reported build 0e8c940-dirty, reflecting the explicitly approved uncommitted source. Local release receipts record rule hashes and Cloud Run revisions; a later Git commit should be followed by an identifiable rebuild when appropriate.
- The new us-central1 function-image repository now has the same seven-day artifact cleanup policy as europe-west3. This applies to deployment container images, not user photos. Minimum instances remain zero and maximum instances three.
- Only the seven writing API functions needed redeployment to enable PUBLIC_WRITES_ENABLED. Read-only functions and notification triggers do not consult the gate; their initial false environment value is intentional.

## Local verification evidence

- Security suite: 96 passed, 0 failed, 0 skipped on 2026-09-11; includes Firestore/Storage rules, API transactions, role isolation, private contact/image access and production write-gate defaults.
- Browser suite: exited 0 on 2026-09-10 using real local Auth/Firestore/Storage/Functions emulators; covered registration recovery, magic link, lost job-create response, photo recovery, token allocation/acceptance, completion/rating and cross-tab logout. No unhandled browser page errors. Mapbox was a deterministic local fixture; real email and push delivery were not exercised.
- Production Nuxt build and Functions TypeScript build: passed on 2026-09-11; SSR dependencies pinned for Node 24. git diff --check passed.
- Evidence logs and screenshots remain local under .firebase and are excluded from Git. These checks do not change production resources.

## Before approval

- Review final code, security tests, browser checks and production build.
- Review [security boundaries](security-boundaries.md) and the [updated Blaze model](blaze-model.md), especially authenticated image delivery.
- Verify actual database and bucket configuration. Do not create or relocate a bucket. Nuxt Storage configuration and JOB_IMAGES_BUCKET must select the existing firebasestorage.app bucket.
- Inspect profiles for duplicate roles. Preserve the intended profile and UID; do not guess which role to delete. The application deliberately refuses conflicts.

## First rollout after approval

1. Use a short maintenance window and stop creating test jobs. Deploy the matching feed index (status, specializationRequired, city, imagesReady) and wait until ready. Emulators do not verify production index-build state.
2. Explicitly configure PUBLIC_WRITES_ENABLED=false and JOB_IMAGES_BUCKET=majstorsada-b2ad4.firebasestorage.app. The pinned CLI prompts even for default parameters without dotenv values. Keep environment files out of Git.
3. Deploy restrictive schema-2 Firestore and Storage rules before opening the new backend. Old tabs fail closed instead of writing public contacts or image paths. New rules alone do not revoke existing token URLs on old photos.
4. With approval, delete only disposable test jobs, private subcollections and their job/staging photos. Parent-document deletion does not delete subcollections. Preserve Auth users, intended profiles, avatars and admins. Review test rating aggregates and dismissed IDs separately; deleting jobs neither recomputes aggregates nor refunds tokens.
5. Deploy API functions, including readJobImage in us-central1, plus SSR and Hosting. Verify runtime service-account access to the existing bucket/default database, regional URLs, indexes and upload CORS. The existing deploy script does not perform cleanup, role review, parameter setup or index-readiness checks.
6. Enable PUBLIC_WRITES_ENABLED=true only after the review and deploy that API environment. Use fresh tabs. No migration of disposable test jobs is needed.
7. Smoke-test real client magic-link login, tradesperson registration/recovery, availability, zero-token feed, photo access, pre-accept contact denial, admin allocation, acceptance/one debit, assigned contact, completion and one rating. Check a second tradesperson and anonymous access. Verify actual push delivery separately.
8. Compare deployed build identifiers, save release evidence and check errors/usage before considering release complete.

## Recovery

Keep writes disabled when smoke tests fail. Fix forward or use a schema-2-compatible rollback while preserving restrictive rules. Do not restore old public contact/photo access. A blanket old-code rollback is incompatible with private contacts.

The authorized first release did not migrate legacy jobs, change bucket lifecycle settings or broaden IAM access. User-photo retention, production abuse monitoring and dependency maintenance remain separate pre-marketing work.

## Dependency maintenance follow-up

The generated SSR production lock audit reports 17 affected packages (two critical, three high, ten moderate and two low). The inspected versions of protobufjs, devalue, node-forge, grpc-js and the sitemap XML parser already occur in the pre-change root lockfile. They were not introduced by the account/job workflow change.

The protobuf code-execution advisory requires attacker-controlled schema descriptors; the application does not accept those. The critical XML advisory concerns attacker-controlled XML/DOCTYPE processing; no corresponding application upload/parser route was found in the inspected source. This is a limited applicability assessment, not proof that every dependency advisory is unreachable. Schedule targeted dependency updates with regression checks before marketing.

Sources: [protobufjs maintainer advisory](https://github.com/protobufjs/protobuf.js/security/advisories/GHSA-xq3m-2v4x-88gg), [fast-xml-parser maintainer advisory](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-m7jm-9gc2-mpf2). Audit details are stored locally under .firebase/phase2-ssr-audit.json.
