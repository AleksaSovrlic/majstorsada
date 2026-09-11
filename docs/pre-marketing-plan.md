# Pre-marketing work packages

Updated after the production rollout and owner acceptance checks, September 2026. The remaining order below is a proposal, not approval to implement every package. Prepare each implementation plan against the then-current code and agree its scope before starting.

## Completed foundations

- Earlier work established Node 24 for API and SSR, versioned builds, pinned SSR dependencies and a repeatable deployment path.
- Package 1 tightened Firestore protected-field allowlists, including additions and deletions, and added regression tests. Published separately before package 2.
- Package 2 centralized role registration and job operations on the server, separated private contact, introduced authenticated photo delivery, and made registration/job submission recoverable after interruptions. One acceptance debits one token; repeat acceptance does not debit twice.
- Package 2 passed 96 security tests, emulator browser workflows, production API/Storage checks and owner-reported manual live checks. Production release and cost assumptions are recorded in phase2-release.md and blaze-model.md.

## Proposed next package: dependency maintenance

Triage the existing production dependency advisories and update affected packages in bounded groups. Preserve Firebase/Nuxt compatibility and the reproducible SSR lockfile. Re-run the relevant security/browser checks and production build before a controlled release. The prior applicability review does not close the reported advisories.

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
