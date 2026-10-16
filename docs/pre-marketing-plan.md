# Pre-marketing work packages

<!-- otp-magic-retirement:current -->
Client email OTP with Amazon SES, legacy email-link retirement, the login performance pass and browser Auth storage recovery are production-released. Existing UIDs, roles and job access remain intact; staff password sign-in is retained. See the [retirement report](otp-magic-link-retirement-report.md), [performance release](otp-performance-deployment-report.md) and [latest storage-recovery release](otp-browser-storage-deployment-report.md). The final pre-marketing release-readiness package remains next and requires its own agreed scope. Earlier package descriptions below retain their dated history.
<!-- /otp-magic-retirement:current -->

Updated 24 September 2026 after cost-control production deployment and automated verification; packages 1–3 are production-released and owner-accepted. Startup optimization is production-released and owner-accepted, including confirmed real push delivery; Git commit/push is authorized. The remaining order below is a proposal, not approval to implement every package. Prepare each implementation plan against the then-current code and agree its scope before starting.

## Completed foundations

- Earlier work established Node 24 for API and SSR, versioned builds, pinned SSR dependencies and a repeatable deployment path.
- Package 1 tightened Firestore protected-field allowlists, including additions and deletions, and added regression tests. Published separately before package 2.
- Package 2 centralized role registration and job operations on the server, separated private contact, introduced authenticated photo delivery, and made registration/job submission recoverable after interruptions. One acceptance debits one token; repeat acceptance does not debit twice.
- Package 2 passed 96 security tests, emulator browser workflows, production API/Storage checks and owner-reported manual live checks. Production release and cost assumptions are recorded in phase2-release.md and blaze-model.md.

## Package 3: dependency maintenance — production released and owner-accepted

Package 3 updates the supported Firebase/Nuxt toolchain and adds the reviewed SSR manifest/lockfile as source artifacts for repeatable installs. Runtime and source/tool audits have no high/critical findings in the reviewed snapshot; remaining moderate findings have individual applicability notes. A stable browser-mounted private entry avoids hydration mismatches when browser-only Auth redirects before mount, while public pages retain SSR/prerendering and private routes remain noindex.

Local validation passed: 98 security tests, 13 build guards, emulator HTTP/business browser flows with hydration-error checking, and compiled SSR/public SEO plus 12 private-route checks. See phase3-report.md for versions, scope, evidence and limitations. Production was published after owner approval; live technical/browser/business checks passed and existing data was preserved. See phase3-release.md. The owner subsequently confirmed the manual live checks passed and authorized the Git commit/push. Initial linked JS/CSS grew by about 74 KB gzip; measure real loading and optimize public-page delivery before marketing.

## Startup optimization — production released and owner-accepted

The owner approved removing notification initialization from the application/header startup path, followed by measurement and regression checks. The initial Auth and server role gate remains unchanged; broader early public-page interactivity has not been introduced. Notification setup/token synchronization run independently, share concurrent work for the same session, and stop stale-session persistence/cleanup. Tradesperson job feeds also start without awaiting notification synchronization.

All 27 targeted lifecycle tests, 98 security tests, 13 build guards, the production build, compiled startup/SSR browser checks and the complete emulator business workflow passed. A controlled 2-second notification delay no longer delays the header: median time from role response to header changed from 2081 ms to 74 ms. This is a synthetic-delay measurement, not a production latency percentile; role verification still takes its normal time. There are no new runtime dependencies, background polling, recurring account reads or instance-budget changes. See [startup-report.md](startup-report.md) for the full measurements, limitations and release checklist. The owner approved production deployment, which completed with matching build identities, preserved budgets/rules/data, live browser/startup checks and successful service worker activation; see [startup-release.md](startup-release.md). The owner subsequently confirmed the live checks and receipt of a real push notification, and explicitly authorized the Git commit/push.

## Current package: abuse prevention and cost control — production released and owner-accepted

The owner approved two new client requests per rolling 24 hours, at most two unexpired pending requests, 24-hour publication/upload deadlines, seven-day closed-photo retention, history pages of three and admin pages of twenty. Active jobs remain live and never expire automatically. See cost-control-plan.md and cost-control-report.md for implementation, tests, pricing assumptions and staged release requirements. Production deployment and budget configuration are complete; see cost-control-release.md. The owner confirmed the live checks passed and authorized Git commit/push with the title `feat(jobs): add lifecycle policies and optimize dashboard loading`. Budget alerts and maxInstances are not spending caps.

## OTP sign-in — production released

Email OTP and the removal of the former client email-link flow are complete. The shared server limit is 500 reserved send attempts per rolling 24 hours, with three per address; UID, role and business data protections remain in place. See the [retirement report](otp-magic-link-retirement-report.md). The original design brief below is retained as historical context.

Design email OTP and account linking while preserving existing UIDs, roles, jobs and token balances. Define verification-attempt limits, resend cooldowns, delivery failure/recovery and email abuse controls before enabling the provider. The approved direction is email OTP, not SMS OTP. Review actual provider pricing and expected volume at that time. Client email remains absent from tradesperson job data; phone access still follows acceptance.

## Final pre-marketing package: release readiness

Check mobile flows, real email OTP/push delivery, loading/error states, public-page performance, conversion tracking and operational monitoring. Integrate existing smoke tests into continuous integration. Complete a final business-workflow acceptance run and document release/recovery steps before marketing traffic is increased.

## Persistent business constraints

- Public tradesperson registration starts unavailable with zero tokens; allocation follows the existing administrator vetting process.
- A matching tradesperson with zero tokens can see the same job details and photos, but cannot accept without a token.
- Structured client phone is available to the assigned tradesperson after acceptance; client email is never shown to tradespeople.
- The first-rollout deletion approval applied only to the three reviewed legacy test jobs and their two photos. It must not be reused for later jobs or accounts.
