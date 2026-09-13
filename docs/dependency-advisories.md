# Dependency advisory review — package 3

Reviewed 2026-09-12. This review distinguishes source/tool dependencies, API runtime dependencies and generated SSR dependencies. Audit counts overlap and are not counts of proven exploitable routes.

The original audit reported 74 affected packages in the root, 18 in the API and 18 in SSR. The upgraded API and SSR audits each report only `gaxios` and its `uuid` dependency (moderate); neither reports high or critical findings. The root's final count is recorded in phase3-report.md after the complete installation check.

## Runtime finding: gaxios / uuid

Both the root and API use Firebase Admin 14.4.0. Its supported Storage chain still includes gaxios 6.7.1 and uuid 9.0.1. The reported bug concerns the v3/v5/v6 APIs when callers provide output buffers with invalid bounds. The inspected gaxios call is `uuid.v4()` for a multipart boundary, without a caller-supplied buffer. Application source does not import these vulnerable uuid APIs. This specific advisory's triggering path was not found in this integration.

Decision: retain the supported upstream dependency instead of forcing an unrelated major uuid/gaxios migration into the Storage SDK. Recheck when the upstream Storage chain changes; this is a documented residual finding, not a declaration that the installed uuid package is patched. Storage upload/finalization/retry tests passed with the new SDK.

Reference: https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq

## Local Firebase CLI findings

The remaining root findings originate in Firebase CLI's dependency chain. The CLI is not uploaded as an API or SSR dependency. Some reports propagate to parent packages such as firebase-tools, express, pubsub and gaxios rather than describing separate defects.

- `@opentelemetry/core` 1.x through the CLI's Pub/Sub client: unbounded W3C baggage processing. This is tooling instrumentation, not the website's incoming request handler. No new Pub/Sub application feature or telemetry endpoint is introduced. Upgrade when the CLI adopts the patched compatible chain; do not replace its 1.x API with 2.x blindly. Reference: https://github.com/advisories/GHSA-8988-4f7v-96qf
- `csv-parse` 5.x: prototype replacement through the columns path. The inspected CLI Auth CSV import calls `parse()` without columns enabled; this release does not perform Auth imports. Do not treat arbitrary imported files as trusted in a future migration. Reference: https://github.com/advisories/GHSA-8cw4-87c7-c6xx
- `stream-json` 1.x: pathological nesting in filters. It is used by local Auth/Realtime Database import tooling and a Next.js integration, not by the site's job API. This release uses none of those import flows. An eventual data-import task needs its own input review and limits. Reference: https://github.com/advisories/GHSA-528h-pc64-c93x
- Older `qs` in CLI Express/exegesis/Google API tooling: query parsing/stringifying edge cases and denial of service. The application Functions Express 5 chain resolves patched qs 6.16.0. These local emulator/tool servers should remain local and are not deployed as application endpoints. References: https://github.com/advisories/GHSA-q8mj-m7cp-5q26 , https://github.com/advisories/GHSA-x5fp-wj9c-mxmx , https://github.com/advisories/GHSA-4mjr-xmp4-gh2g

Decision: retain the current supported CLI after updating compatible transitive dependencies. Some `npm audit` suggestions would downgrade Firebase CLI to 10.1.1; this is not a suitable security fix for a Node 24/modern Functions deployment. Revisit these findings during the next dependency review or before using the affected import/tooling capabilities.

## Scope and limits

Nuxt, Nitro and h3 can be bundled into server chunks rather than listed in the generated package manifest. They were checked through the root lock and build output as well as the SSR audit. Audits cannot prove absence of all vulnerabilities. The relevant shipping paths have no known high/critical findings in this audit snapshot, and the remaining runtime advisory has the applicability analysis above.
