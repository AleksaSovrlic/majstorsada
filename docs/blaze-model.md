# Phase 2 Blaze cost model

Reviewed 2026-09-10. This estimates the implemented code, not a guaranteed zero bill. Firestore is in europe-west3; the existing image bucket is in us-central1. Hosting, SSR, notifications, listeners, deployments, artifact storage and account-wide consumption also count.

## Counted operations

Normal successful requests, before transaction retries and existing listeners:

| Operation | Firestore reads | Writes |
| --- | ---: | ---: |
| Resolve role | 3 | 0 |
| Register profile | 3 | 1 (0 on retry) |
| Create job + private contact + cooldown | 4 | 3 |
| Finalize images | 6 | 2 |
| Accept job | 5 | 2 |
| Complete job | 4 | 1 |
| Rate completed job | 5 | 2 |
| Read image before acceptance, matching tradesperson | 4 | 0 |
| Read image, owner or assigned tradesperson | 1 | 0 |

A complete job with photos and one rating uses 24 backend reads and 10 writes before photo views and existing UI/notification reads. A no-photo job skips finalization: 18 reads, 8 writes. Role resolution is cached for the session; failures never cache a guessed client role.

The photo boundary adds one function request per displayed photo. Upload plus publication uses approximately two Storage Class A operations per photo; metadata checks and downloads consume Class B operations. Retries and resumable-upload details can add operations. Copies stay within the bucket.

## Example workload

Assume 30 days, two 256 KiB photos per job, and ten matching tradespeople each viewing both photos once. Excludes revisits, abuse and other account consumption.

| Jobs/day | Photo requests/month | Photo transfer/month | Backend reads/day including photos | Image internet-transfer budget |
| --- | ---: | ---: | ---: | ---: |
| 10 | 6,000 | 1.46 GiB | 1,040 | about $0.18/month |
| 100 | 60,000 | 14.65 GiB | 10,400 | about $1.76/month |
| 500 | 300,000 | 73.24 GiB | 52,000 | about $8.79/month |

Transfer estimates conservatively use $0.12/GiB without subtracting free networking credit. The generic network table lists an initial free GiB for Europe, while the Cloud Run overview describes free transfer in North America; this model does not depend on that credit. These are image-delivery costs only, not the total bill. USD before taxes/currency conversion.

At 100 jobs/day: about 312,000 backend reads/month (10,400/day), 30,000 writes/month (1,000/day), 60,000 photo requests and roughly 12,000 photo Class A operations. Above the 5,000-operation allowance, those A operations cost approximately $0.035/month. Class B overage is also in cents at this volume. CPU/memory can stay within free credits, but actual duration, regional pricing and other usage determine that outcome; request count alone does not establish compute cost.

**Correction to the earlier estimate:** Storage's free 100 GB transfer allowance does not make Cloud Run image delivery free. Authenticated image delivery changes where internet transfer is billed. Budget for small charges rather than promising a zero bill at initial volume.

## Allowances and practical limits

- Firestore: 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day, 1 GiB stored data for the eligible default database. At 500 jobs/day this example already exceeds reads before listeners/notifications. Repeated reloads and accumulated pending jobs can exceed it sooner. [Firestore quotas](https://firebase.google.com/docs/firestore/quotas)
- Cloud Run request billing: 2 million requests/month; compute credits aggregate across the billing account using Tier 1 pricing. No minimum instances are introduced. [Cloud Run pricing](https://cloud.google.com/run/pricing)
- Eligible US Storage regions: 5 GB-months, 5,000 Class A, 50,000 Class B operations and the documented Storage transfer allowance. Bucket-to-service traffic in the same region is free; final image delivery uses Cloud Run/network pricing. [Storage pricing](https://cloud.google.com/storage/pricing), [network pricing](https://cloud.google.com/vpc/network-pricing)

Photos accumulate: 100 jobs/day at these sizes adds about 1.46 GiB every 30 days, plus soft-deleted staging copies and existing files. The existing seven-day soft-delete retention also counts. Monthly traffic allowances do not reset stored history.

Before marketing, review budget alerts, usage, retention, anti-abuse controls and unbounded feed/history queries. Budget alerts and maxInstances are not hard spending limits. SMS OTP is outside this change and these estimates.
