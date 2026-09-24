// Read-only production audit. No resources, users, jobs, budgets or policies are changed.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url), auth = require('firebase-tools/lib/auth.js')
const project = 'majstorsada-b2ad4', account = auth.getGlobalDefaultAccount()
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI login required')
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'])
async function get(url, body) {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, headers: { Authorization: 'Bearer ' + token.access_token, 'X-Goog-User-Project': project, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000) })
  const result = await response.json()
  if (!response.ok) throw new Error(`${response.status}: ${result.error?.message || 'Unavailable'}`)
  return result
}
const report = { at: new Date().toISOString(), project, readOnly: true, results: {} }
const jobs = {
  database: `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`,
  bucket: `https://storage.googleapis.com/storage/v1/b/${project}.firebasestorage.app?fields=name,location,lifecycle,softDeletePolicy`,
  billing: `https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`,
  alerts: `https://monitoring.googleapis.com/v3/projects/${project}/alertPolicies?pageSize=100`,
}
for (const [name, url] of Object.entries(jobs)) {
  try { report.results[name] = await get(url) } catch (error) { report.results[name] = { unavailable: error.message } }
}
const end = new Date(), start = new Date(end - 7 * 86400000)
for (const [name, metric] of Object.entries({ firestoreReads: 'firestore.googleapis.com/document/read_count', firestoreWrites: 'firestore.googleapis.com/document/write_count', runRequests: 'run.googleapis.com/request_count', runInstanceSeconds: 'run.googleapis.com/container/billable_instance_time' })) {
  const params = new URLSearchParams({ filter: `metric.type="${metric}"`, 'interval.startTime': start.toISOString(), 'interval.endTime': end.toISOString(), 'aggregation.alignmentPeriod': '86400s', 'aggregation.perSeriesAligner': 'ALIGN_SUM', 'aggregation.crossSeriesReducer': 'REDUCE_SUM', pageSize: '100' })
  try { report.results[name] = await get(`https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${params}`) }
  catch (error) { report.results[name] = { unavailable: error.message } }
}
const billing = report.results.billing?.billingAccountName
if (billing) {
  try { report.results.budgets = await get(`https://billingbudgets.googleapis.com/v1/${billing}/budgets?pageSize=100`) }
  catch (error) { report.results.budgets = { unavailable: error.message } }
}
try {
  const rows = await get(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`, {
    structuredQuery: { from: [{ collectionId: 'jobs' }], select: { fields: ['status', 'policyVersion', 'expiresAt', 'imagesReady', 'photoCount', 'createdAt'].map(fieldPath => ({ fieldPath })) }, limit: 101 }
  })
  report.results.jobPolicyInventory = { truncated: rows.filter(row => row.document).length > 100, jobs: rows.filter(row => row.document).slice(0, 100).map(row => ({ id: row.document.name.split('/').at(-1), updateTime: row.document.updateTime, fields: row.document.fields })) }
} catch (error) { report.results.jobPolicyInventory = { unavailable: error.message } }
mkdirSync('.firebase/cost-control', { recursive: true })
writeFileSync('.firebase/cost-control/production-audit.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.results).map(([key, value]) => [key, value.unavailable ? { unavailable: value.unavailable } : { available: true, series: value.timeSeries?.length, policies: value.alertPolicies?.length, budgets: value.budgets?.length }])), null, 2))
