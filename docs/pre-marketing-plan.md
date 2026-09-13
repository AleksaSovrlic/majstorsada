# Pre-marketing work packages

Updated 13 September 2026 after package 3 production deployment and automated verification; packages 1 and 2 are already production-released and owner-accepted. The remaining order below is a proposal, not approval to implement every package. Prepare each implementation plan against the then-current code and agree its scope before starting.

## Completed foundations

- Earlier work established Node 24 for API and SSR, versioned builds, pinned SSR dependencies and a repeatable deployment path.
- Package 1 tightened Firestore protected-field allowlists, including additions and deletions, and added regression tests. Published separately before package 2.
- Package 2 centralized role registration and job operations on the server, separated private contact, introduced authenticated photo delivery, and made registration/job submission recoverable after interruptions. One acceptance debits one token; repeat acceptance does not debit twice.
- Package 2 passed 96 security tests, emulator browser workflows, production API/Storage checks and owner-reported manual live checks. Production release and cost assumptions are recorded in phase2-release.md and blaze-model.md.

## Current package: dependency maintenance — production released and owner-accepted

Package 3 updates the supported Firebase/Nuxt toolchain and adds the reviewed SSR manifest/lockfile as source artifacts for repeatable installs. Runtime and source/tool audits have no high/critical findings in the reviewed snapshot; remaining moderate findings have individual applicability notes. A stable browser-mounted private entry avoids hydration mismatches when browser-only Auth redirects before mount, while public pages retain SSR/prerendering and private routes remain noindex.

Local validation passed: 98 security tests, 13 build guards, emulator HTTP/business browser flows with hydration-error checking, and compiled SSR/public SEO plus 12 private-route checks. See phase3-report.md for versions, scope, evidence and limitations. Production was published after owner approval; live technical/browser/business checks passed and existing data was preserved. See phase3-release.md. The owner subsequently confirmed the manual live checks passed and authorized the Git commit/push. Initial linked JS/CSS grew by about 74 KB gzip; measure real loading and optimize public-page delivery before marketing.

## Following package: abuse prevention and cost control

Review write/read abuse paths, Firebase usage alerts, unbounded feed/history queries, and pagination. Define expiration/retention for old jobs, unfinished uploads and photos according to the actual business workflow. Measure reads, writes, image traffic and storage accumulation. Avoid additional always-on services. Budget alerts and maxInstances are not spending caps.

## Following package: OTP sign-in

Design phone verification and account linking while preserving existing UIDs, roles, jobs and token balances. Define retry limits, resend cooldowns, delivery failure/recovery and SMS abuse controls before enabling SMS. Review actual provider pricing and expected volume at that time. Client email remains absent from tradesperson job data; phone access still follows acceptance.

## Final pre-marketing package: release readiness

Check mobile flows, real email/SMS/push delivery as applicable, loading/error states, public-page performance, conversion tracking and operational monitoring. Integrate existing smoke tests into continuous integration. Complete a final business-workflow acceptance run and document release/recovery steps before marketing traffic is increased.

## Persistent business constraints

- Public tradesperson registration starts unavailable with zero tokens; allocation follows the existing administrator vetting process.
- A matching tradesperson with zero tokens can see the same job details and photos, but cannot accept without a token.
- Structured client phone is available to the assigned tradesperson after acceptance; client email is never shown to tradespeople.
- The first-rollout deletion approval applied only to the three reviewed legacy test jobs and their two photos. It must not be reused for later jobs or accounts.
