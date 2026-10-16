import { isIP } from 'node:net'
import { randomBytes } from 'node:crypto'
import { readFile, mkdir, writeFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readOtpParameters } from './otp-aws-config.mjs'
import { PROJECT_ID } from './otp-cloud-policy.mjs'

export const INGRESS_URLS = Object.freeze(['requestClientOtp', 'verifyClientOtp'].map(name =>
  `https://europe-west3-${PROJECT_ID}.cloudfunctions.net/${name}`))
const FUNCTION_NAMES = Object.freeze(['requestClientOtp', 'verifyClientOtp'])
const approvedRouteSets = new WeakSet()
const fixedRoutes = Object.freeze(INGRESS_URLS.map((url, i) => Object.freeze({ url, function: FUNCTION_NAMES[i], surface: 'cloudfunctions' })))
approvedRouteSets.add(fixedRoutes)
export class IngressProbeError extends Error {}
const fail = code => { throw new IngressProbeError(`Ingress verification stopped (${code})`) }
// Only scoped Google metadata can introduce a credential-bearing Run alias.
export function deriveIngressRoutes(functions) {
  if (!Array.isArray(functions) || functions.length !== 2) fail('FUNCTION_METADATA_INVALID')
  const aliases = []
  for (const name of FUNCTION_NAMES) {
    const matches = functions.filter(fn => fn?.name === `projects/${PROJECT_ID}/locations/europe-west3/functions/${name}`)
    if (matches.length !== 1) fail('FUNCTION_METADATA_INVALID')
    const fn = matches[0], config = fn.serviceConfig, serviceName = name.toLowerCase()
    if (fn.environment !== 'GEN_2' || fn.state !== 'ACTIVE'
      || config?.serviceAccountEmail !== `otp-runtime@${PROJECT_ID}.iam.gserviceaccount.com`
      || ![`projects/${PROJECT_ID}/locations/europe-west3/services/${serviceName}`,
        `projects/526260795061/locations/europe-west3/services/${serviceName}`].includes(config.service)) fail('FUNCTION_METADATA_INVALID')
    let uri
    try { uri = new URL(config.uri) } catch { fail('FUNCTION_URI_INVALID') }
    if (typeof config.uri !== 'string' || !config.uri.startsWith('https://') || uri.protocol !== 'https:'
      || uri.username || uri.password || uri.port || uri.pathname !== '/' || uri.search || uri.hash
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*\.run\.app$/.test(uri.hostname)
      || !uri.hostname.startsWith(serviceName + '-')) fail('FUNCTION_URI_INVALID')
    const deterministic = `https://${serviceName}-526260795061.europe-west3.run.app/`
    if (uri.href === deterministic) fail('FUNCTION_ALIASES_INCOMPLETE')
    aliases.push(Object.freeze({url:uri.href,function:name,surface:'run-hash'}),
      Object.freeze({url:deterministic,function:name,surface:'run-deterministic'}))
  }
  const routes = Object.freeze([...fixedRoutes, ...aliases])
  if (new Set(routes.map(route => route.url)).size !== 6) fail('FUNCTION_ALIASES_INCOMPLETE')
  approvedRouteSets.add(routes)
  return routes
}
function validatedRoutes(routes) {
  const selected = routes === undefined ? fixedRoutes : routes
  if (!approvedRouteSets.has(selected)) fail('INGRESS_ROUTES_UNAPPROVED')
  return selected
}
export async function readCloudIngressRoutes(request) {
  const metadata = []
  for (const name of FUNCTION_NAMES) {
    try { metadata.push(await request('functions', 'GET', `/v2/projects/${PROJECT_ID}/locations/europe-west3/functions/${name}`)) }
    catch { fail('FUNCTION_METADATA_UNAVAILABLE') }
  }
  return deriveIngressRoutes(metadata)
}

export function canonicalProbeIp(value) {
  if (typeof value !== 'string' || value.length > 64 || value.includes('%')) return null
  const ip = value.trim(), type = isIP(ip)
  if (type === 4) return ip
  if (type !== 6) return null
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1)
  const mapped = /^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/.exec(canonical)
  if (!mapped) return canonical
  const upper = parseInt(mapped[1], 16), lower = parseInt(mapped[2], 16)
  return [upper >>> 8, upper & 255, lower >>> 8, lower & 255].join('.')
}
export function validateIngressProbeConfig(text, { commonText = '', environment = process.env, now = Date.now(), requireActiveWindow = true } = {}) {
  let values, common
  try { values = readOtpParameters(text); common = readOtpParameters(commonText) } catch { fail('INVALID_LOCAL_CONFIGURATION') }
  const keys = ['OTP_ENABLED', 'OTP_PUBLIC_ENABLED', 'OTP_TRUSTED_PROXY_HOPS', 'OTP_DAILY_LIMIT',
    'OTP_DIAGNOSTICS_WINDOW_START', 'OTP_DIAGNOSTIC_GOOGLE_SUBJECT', 'OTP_DIAGNOSTIC_GOOGLE_EMAIL']
  if (keys.some(key => Object.hasOwn(environment, key) || common.has(key))
    || environment.FUNCTIONS_EMULATOR || environment.OTP_DEMO_MODE || environment.FIRESTORE_EMULATOR_HOST || environment.FIREBASE_AUTH_EMULATOR_HOST) fail('LOCAL_OVERRIDE_FORBIDDEN')
  for (const [key, value] of [['OTP_ENABLED','false'], ['OTP_PUBLIC_ENABLED','false'], ['OTP_TRUSTED_PROXY_HOPS','0'], ['OTP_DAILY_LIMIT','500']]) {
    if (values.get(key) !== value) fail('OTP_NOT_CLOSED')
  }
  if (!Number.isFinite(now)) fail('DIAGNOSTIC_WINDOW_CLOSED')
  const start = values.get('OTP_DIAGNOSTICS_WINDOW_START'), parsed = Date.parse(start)
  if (!requireActiveWindow && start!=='') fail('DIAGNOSTIC_WINDOW_NOT_CLEARED')
  if (requireActiveWindow && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(start ?? '') || !Number.isFinite(parsed)
    || new Date(parsed).toISOString() !== start || now < parsed || now - parsed >= 30 * 60_000)) fail('DIAGNOSTIC_WINDOW_CLOSED')
  const subject = values.get('OTP_DIAGNOSTIC_GOOGLE_SUBJECT'), actor = values.get('OTP_DIAGNOSTIC_GOOGLE_EMAIL')
  if (!/^\d{6,255}$/.test(subject ?? '') || typeof actor !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(actor)) fail('OWNER_PIN_MISSING')
  return { actor, subject, start }
}
async function boundedText(response, maximum) {
  if (!response.body) fail('EMPTY_RESPONSE')
  const chunks = []; let length = 0
  const reader = response.body.getReader()
  try {
    for (;;) {
      const {done,value}=await reader.read(); if(done) break
      length+=value.byteLength
      if(length>maximum) { void reader.cancel().catch(()=>{}); fail('RESPONSE_TOO_LARGE') }
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally { reader.releaseLock() }
}
export async function discoverProbeIp(fetchImpl = fetch) {
  try {
    const response=await fetchImpl('https://checkip.amazonaws.com', {method:'GET',redirect:'error',signal:AbortSignal.timeout(5000)})
    if(response.status!==200 || response.redirected || (response.url && response.url!=='https://checkip.amazonaws.com/')) fail('EGRESS_IP_UNAVAILABLE')
    const ip=canonicalProbeIp(await boundedText(response,128)); if(!ip) fail('EGRESS_IP_INVALID')
    return ip
  } catch(error) { if(error instanceof IngressProbeError) throw error; fail('EGRESS_IP_UNAVAILABLE') }
}
// A single independently observed egress address must occupy the same trusted
// right-edge position on both real URLs despite caller-controlled prefixes.
// Mismatch is a blocker, never permission to guess another address or hop count.
export async function probeIngress({getToken,fetchImpl=fetch,expectedClientIp,now=Date.now,routes:requestedRoutes}) {
  const selectedRoutes = validatedRoutes(requestedRoutes)
  const expected=canonicalProbeIp(expectedClientIp); if(!expected || ['198.51.100.11','2001:db8::11','203.0.113.19','203.0.113.99'].includes(expected)) fail('EXPECTED_CLIENT_IP_INVALID')
  const variants=[undefined,'198.51.100.11','2001:db8::11','198.51.100.11, 2001:db8::11, 203.0.113.19','not-an-ip']
  let token
  try { token=await getToken() } catch { fail('OPERATOR_AUTH_UNAVAILABLE') }
  if(typeof token!=='string'|| !/^[\x21-\x7e]{1,4096}$/.test(token)) fail('OPERATOR_AUTH_INVALID')
  let candidate, tail; const routes=[]
  for(const route of selectedRoutes) {
    const { url } = route
    const chainLengths=[]
    for(const prefix of variants) {
      const nonce=randomBytes(32).toString('base64url')
      let data,response
      try {
        response=await fetchImpl(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(7000),
          headers:{Origin:'https://majstorsada.rs','Content-Type':'application/json','X-OTP-Diagnostic':'ingress-v1',
            Authorization:`Bearer ${token}`,...(prefix===undefined?{}:{'X-Forwarded-For':prefix,'CF-Connecting-IP':'203.0.113.99'})},
          body:JSON.stringify({diagnostic:'ingress-v1',nonce})})
        if(response.redirected || (response.url && response.url!==url) || response.status!==200 || !/(?:^|,)\s*(?:private\s*,\s*)?no-store(?:\s*,|$)/i.test(response.headers.get('cache-control')??'')
          || !/^application\/json\b/i.test(response.headers.get('content-type')??'')) fail('ENDPOINT_NOT_DIAGNOSTIC_READY')
        data=JSON.parse(await boundedText(response,8192))
      } catch(error) { if(error instanceof IngressProbeError) throw error; fail('ENDPOINT_RESPONSE_INVALID') }
      if(!data || typeof data!=='object' || Array.isArray(data) || Object.keys(data).sort().join(',')!=='diagnostic,forwarded,nonce,ok,socketIp' || data.ok!==true || data.diagnostic!=='ingress-v1' || data.nonce!==nonce
        || !Array.isArray(data.forwarded) || data.forwarded.length>32
        || data.forwarded.some(ip=>ip!==null && canonicalProbeIp(ip)!==ip)
        || !(data.socketIp===null || canonicalProbeIp(data.socketIp)===data.socketIp)) fail('DIAGNOSTIC_SCHEMA_INVALID')
      const positions=data.forwarded.flatMap((ip,i)=>ip===expected?[i]:[])
      if(positions.length!==1) fail('CLIENT_IP_AMBIGUOUS')
      const hops=data.forwarded.length-positions[0]
      if(hops<1||hops>4) fail('CLIENT_IP_OUTSIDE_ALLOWED_SUFFIX')
      const suffixValues=data.forwarded.slice(-hops)
      if(suffixValues.some(ip=>ip===null || ['198.51.100.11','2001:db8::11','203.0.113.19','203.0.113.99'].includes(ip))) fail('TRUSTED_SUFFIX_INVALID')
      const suffix=JSON.stringify(suffixValues)
      if(candidate===undefined) {candidate=hops;tail=suffix}
      else if(candidate!==hops || tail!==suffix) fail('INCONSISTENT_TRUSTED_SUFFIX')
      chainLengths.push(data.forwarded.length)
    }
    routes.push({function:route.function,surface:route.surface,requests:variants.length,forwardedCounts:chainLengths,spoofedPrefixesRejected:true})
  }
  return {projectId:PROJECT_ID,region:'europe-west3',verifiedAt:new Date(now()).toISOString(),candidateTrustedProxyHops:candidate,
    status:'candidate_requires_operator_review',routes,requestCount:variants.length*selectedRoutes.length,
    ipValuesPersisted:false,tokensPersisted:false,otpEnabled:false,mailSent:false,databaseWrites:false}
}
export async function verifyClosedIngress({fetchImpl=fetch,routes:requestedRoutes}={}) {
  const selectedRoutes = validatedRoutes(requestedRoutes)
  for(const {url} of selectedRoutes) {
    try {
      const response=await fetchImpl(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(7000),
        headers:{Origin:'https://majstorsada.rs','Content-Type':'application/json','X-OTP-Diagnostic':'ingress-v1'},
        body:JSON.stringify({diagnostic:'ingress-v1',nonce:randomBytes(32).toString('base64url')})})
      if(response.redirected||(response.url&&response.url!==url)||response.status!==503||!response.headers.get('cache-control')?.includes('no-store'))fail('DIAGNOSTICS_NOT_CONFIRMED_CLOSED')
      const data=JSON.parse(await boundedText(response,4096))
      if(data?.ok!==false||data.code!=='unavailable'||Object.hasOwn(data,'forwarded'))fail('DIAGNOSTICS_NOT_CONFIRMED_CLOSED')
    } catch(error) {if(error instanceof IngressProbeError)throw error;fail('DIAGNOSTIC_CLOSURE_CHECK_FAILED')}
  }
  return {projectId:PROJECT_ID,diagnosticsClosed:true,endpointsChecked:selectedRoutes.length,authenticatedLookupRequested:false,ipValuesPersisted:false,tokensPersisted:false}
}
async function optionalText(path) { try {return await readFile(path,'utf8')} catch(e) {if(e.code==='ENOENT')return '';throw e} }
export async function readIngressProbeConfig(root,{environment=process.env,now=Date.now(),requireActiveWindow=true}={}) {
  const rc=JSON.parse(await readFile(resolve(root,'.firebaserc'),'utf8'))
  if(rc.projects?.default!==PROJECT_ID)fail('WORKSPACE_PROJECT_CHANGED')
  const commonText=await optionalText(resolve(root,'functions/.env'))
  try { await access(resolve(root,'functions/.env.local')); fail('LOCAL_EMULATOR_CONFIGURATION_PRESENT') } catch(error) { if(error.code!=='ENOENT')throw error }
  return validateIngressProbeConfig(await readFile(resolve(root,`functions/.env.${PROJECT_ID}`),'utf8'),{commonText,environment,now,requireActiveWindow})
}
async function main() {
  if(process.argv.slice(2).length!==1||!['--probe','--verify-closed'].includes(process.argv[2]))fail('EXPLICIT_PROBE_REQUIRED')
  const root=fileURLToPath(new URL('../',import.meta.url))
  const closed=process.argv[2]==='--verify-closed'
  const config=await readIngressProbeConfig(root,{requireActiveWindow:!closed})
  const {firebaseGoogleApi}=await import('./otp-google-api.mjs')
  const api=await firebaseGoogleApi(PROJECT_ID)
  const routes=await readCloudIngressRoutes(api.request)
  if(closed){const report=await verifyClosedIngress({routes});console.log(JSON.stringify(report,null,2));return}
  const {firebaseDiagnosticIdentity}=await import('./otp-diagnostic-auth.mjs')
  const identity=await firebaseDiagnosticIdentity()
  if(identity.actor!==config.actor||identity.subject!==config.subject)fail('OPERATOR_IDENTITY_MISMATCH')
  const expectedClientIp=await discoverProbeIp()
  const report=await probeIngress({...identity,expectedClientIp,routes})
  const dir=resolve(root,'.firebase/otp-ingress');await mkdir(dir,{recursive:true})
  await writeFile(resolve(dir,'probe.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
  console.log(JSON.stringify(report,null,2))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error=>{console.error(error instanceof IngressProbeError?error.message:'Ingress verification failed; no application configuration changed');process.exitCode=1})
}
