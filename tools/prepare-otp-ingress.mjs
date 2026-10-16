import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PROJECT_ID, SA_EMAIL } from './otp-cloud-policy.mjs'
import { APPROVED_GOOGLE_SUBJECT } from './otp-secret-policy.mjs'
import { assertClosedAwsConfiguration, readOtpParameters } from './otp-aws-config.mjs'
import { firebaseGoogleApi, GoogleApiError } from './otp-google-api.mjs'
import { readSecretPreparation } from './prepare-otp-secrets.mjs'
import { functionsInventory } from './prepare-otp-google.mjs'
import { firebaseDiagnosticIdentity, DiagnosticAuthError } from './otp-diagnostic-auth.mjs'

const ROOT=fileURLToPath(new URL('../',import.meta.url))
const require=createRequire(import.meta.url)
const functionsRequire=createRequire(resolve(ROOT,'functions/package.json'))
export const CLOSED_OTP_SELECTOR='functions:api:requestClientOtp,functions:api:verifyClientOtp'
export class OtpRolloutError extends Error {}
const genericRolloutFailure='OTP rollout preparation failed; review prerequisites without changing deployment'
const validFailureCode=code=>typeof code==='string'&&/^[A-Z_]{1,60}$/.test(code)
const filesystemFailureCodes=new Set(['EACCES','EPERM','EBUSY','ENOSPC'])
// Retain actionable prerequisite codes without exposing provider bodies, paths,
// credentials, causes or arbitrary messages from failed external operations.
export function formatOtpRolloutError(error) {
  if(error instanceof OtpRolloutError)return error.message
  if(error instanceof DiagnosticAuthError&&validFailureCode(error.code))return 'Diagnostic operator authentication failed ('+error.code+')'
  if(error instanceof GoogleApiError&&validFailureCode(error.code)
    &&Number.isInteger(error.status)&&(error.status===0||(error.status>=100&&error.status<=599))) {
    return 'Google OTP prerequisite request failed ('+(error.status||'network')+'; '+error.code+')'
  }
  if(error&&filesystemFailureCodes.has(error.code))return 'OTP rollout preparation file operation failed ('+error.code+'); review prerequisites without changing deployment'
  return genericRolloutFailure
}
const stop=message=>{throw new OtpRolloutError(message)}
export function assertScopedOtpSelector(config,functionIds) {
  if(!Array.isArray(config.functions) || config.functions.filter(item=>item.codebase==='api'&&item.source==='functions').length!==1)stop('OTP source/codebase configuration changed')
  const helper=require('firebase-tools/lib/deploy/functions/functionsDeployHelper')
  const filters=helper.getEndpointFilters({only:CLOSED_OTP_SELECTOR},config.functions)
  if(helper.targetCodebases(config.functions,filters).join(',')!=='api')stop('Deployment selector includes an unexpected codebase')
  const matches=functionIds.filter(id=>helper.endpointMatchesAnyFilter({id,codebase:'api'},filters)).sort()
  if(JSON.stringify(matches)!==JSON.stringify(['requestClientOtp','verifyClientOtp']))stop('Scoped deployment does not select exactly two OTP functions')
  return CLOSED_OTP_SELECTOR
}
export function assertClosedRuntimeManifest(runtime,parameters) {
  const defaults={OTP_ENABLED:false,OTP_PUBLIC_ENABLED:false,OTP_TRUSTED_PROXY_HOPS:0,OTP_DAILY_LIMIT:500,
    OTP_DIAGNOSTICS_WINDOW_START:'',OTP_DIAGNOSTIC_GOOGLE_SUBJECT:'',OTP_DIAGNOSTIC_GOOGLE_EMAIL:''}
  for(const [key,value]of Object.entries(defaults))if(parameters.find(item=>item.name===key)?.default!==value)stop('OTP runtime default changed: '+key)
  for(const [name,secrets]of [['requestClientOtp',['OTP_HMAC_SECRET','OTP_TURNSTILE_SECRET']],['verifyClientOtp',['OTP_HMAC_SECRET']]]) {
    const endpoint=runtime[name]?.__endpoint
    if(!endpoint||endpoint.platform!=='gcfv2'||endpoint.region?.join(',')!=='europe-west3'
      ||endpoint.serviceAccountEmail?.toJSON?.()!=='params.OTP_RUNTIME_SERVICE_ACCOUNT'
      ||endpoint.minInstances!==0||endpoint.maxInstances!==2||endpoint.concurrency!==10||endpoint.availableMemoryMb!==256||endpoint.timeoutSeconds!==60
      ||endpoint.httpsTrigger?.invoker?.join(',')!=='public'
      ||JSON.stringify(endpoint.secretEnvironmentVariables?.map(item=>item.key).sort())!==JSON.stringify(secrets))stop('OTP compiled runtime boundary changed: '+name)
  }
}
// The pinned non-interactive CLI resolves every declared non-secret parameter
// from user dotenv assignments, including parameters with SDK defaults.
export function assertDeploymentParameterCoverage(parameters,entries) {
  if(!Array.isArray(parameters)||!(entries instanceof Map))stop('Invalid deployment parameter manifest')
  const missing=new Set()
  for(const parameter of parameters) {
    if(!parameter||typeof parameter.name!=='string'||!/^[A-Z_][A-Z0-9_]{0,127}$/.test(parameter.name))stop('Invalid deployment parameter name')
    if(parameter.type!=='secret'&&!entries.has(parameter.name))missing.add(parameter.name)
  }
  if(missing.size)stop('Missing explicit deployment parameters: '+[...missing].sort().join(', '))
}
export function assertInactiveDiagnosticPins(text,identity) {
  const entries=readOtpParameters(text)
  if(entries.get('OTP_DIAGNOSTICS_WINDOW_START')!=='')stop('Close the existing diagnostic window before initial deployment preparation')
  if(entries.get('OTP_DIAGNOSTIC_GOOGLE_SUBJECT')!==identity.subject||entries.get('OTP_DIAGNOSTIC_GOOGLE_EMAIL')!==identity.actor)stop('Diagnostic operator identity differs from pinned local configuration')
}
export function readFrontendOtpFlags(text) {
  let parsed
  try { parsed=require('firebase-tools/lib/functions/env').parse(text) } catch { stop('Frontend dotenv parsing failed') }
  if(parsed.errors.length)stop('Frontend dotenv parsing failed')
  const keys=['NUXT_PUBLIC_AUTH_MODE','NUXT_PUBLIC_TURNSTILE_SITE_KEY']
  for(const key of keys) {
    const count=text.split(/\r?\n/).filter(line=>new RegExp('^\\s*(?:export\\s+)?'+key+'\\s*=').test(line)).length
    if(count!==1 || typeof parsed.envs[key]!=='string' || /[\r\n]/.test(parsed.envs[key]))stop('Missing or ambiguous frontend OTP flag')
  }
  return new Map(keys.map(key=>[key,parsed.envs[key]]))
}
async function optional(path){try{return await readFile(path,'utf8')}catch(error){if(error.code==='ENOENT')return '';throw error}}
export async function localState() {
  const rc=JSON.parse(await readFile(resolve(ROOT,'.firebaserc'),'utf8'));if(rc.projects?.default!==PROJECT_ID)stop('Workspace Firebase project changed')
  const path=resolve(ROOT,`functions/.env.${PROJECT_ID}`),text=await readFile(path,'utf8')
  const entries=readOtpParameters(text),common=readOtpParameters(await optional(resolve(ROOT,'functions/.env')))
  const relevant=key=>key.startsWith('OTP_')||key.startsWith('NUXT_PUBLIC_AUTH_')||key==='NUXT_PUBLIC_TURNSTILE_SITE_KEY'
  if([...common.keys()].some(relevant)||Object.keys(process.env).some(relevant)
    ||await optional(resolve(ROOT,'functions/.env.local')))stop('Conflicting local environment override; review before OTP rollout')
  if(process.env.FUNCTIONS_EMULATOR||process.env.OTP_DEMO_MODE||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)stop('Do not prepare a production rollout from an emulator environment')
  const evidence=JSON.parse(await readFile(resolve(ROOT,'.firebase/otp-aws/owner-console-evidence.json'),'utf8'))
  assertClosedAwsConfiguration(text,evidence,APPROVED_GOOGLE_SUBJECT)
  let publicKey
  for(const name of ['.env','.env.production']) {
    const values=readFrontendOtpFlags(await readFile(resolve(ROOT,name),'utf8'))
    if(values.get('NUXT_PUBLIC_AUTH_MODE')!=='magic-link'||!values.get('NUXT_PUBLIC_TURNSTILE_SITE_KEY'))stop('Frontend must retain magic-link and a configured public Turnstile key')
    if(publicKey!==undefined&&publicKey!==values.get('NUXT_PUBLIC_TURNSTILE_SITE_KEY'))stop('Frontend Turnstile keys differ across build modes')
    publicKey=values.get('NUXT_PUBLIC_TURNSTILE_SITE_KEY')
  }
  const config=JSON.parse(await readFile(resolve(ROOT,'firebase.json'),'utf8'))
  const runtime=require('../functions/lib/otpRuntime.js')
  const {declaredParams}=functionsRequire('firebase-functions/params')
  assertClosedRuntimeManifest(runtime,declaredParams.map(item=>item.toSpec()))
  const functions=require('../functions/lib/index.js')
  assertDeploymentParameterCoverage(declaredParams.map(item=>item.toSpec()),entries)
  assertScopedOtpSelector(config,Object.keys(functions).filter(name=>functions[name]?.__endpoint))
  return {path,text,entries}
}
export async function buildClosedRolloutPlan({state,inventory,identity,localText}) {
  assertInactiveDiagnosticPins(localText,identity)
  if(state.status!=='verified'||state.actions.length||state.blockers.length)stop('Google identity and secret preparation are incomplete')
  if(inventory.some(item=>/\/functions\/(?:requestClientOtp|verifyClientOtp)$/.test(item.name)))stop('OTP endpoints already exist; inspect their actual deployment state before proceeding')
  return {projectId:PROJECT_ID,region:'europe-west3',status:'ready_for_closed_deployment_approval',serviceAccount:SA_EMAIL,
    selector:CLOSED_OTP_SELECTOR,existingFunctions:inventory.length,diagnostics:'inactive; explicit 30-minute window required',
    publicAuthMode:'magic-link',otpEnabled:false,publicOtpEnabled:false,trustedProxyHops:0,dailyLimit:500,
    newIamGrants:0,newSecrets:0,newDependencies:0,secretValuesRead:false,deploymentPerformed:false,
    nextCommands:["node tools/prepare-otp-ingress.mjs --open-window",
      `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project ${PROJECT_ID} --only ${CLOSED_OTP_SELECTOR} --non-interactive`,
      'npm run otp:ingress:probe','node tools/prepare-otp-ingress.mjs --close-window',
      `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project ${PROJECT_ID} --only ${CLOSED_OTP_SELECTOR} --non-interactive`,
      'npm run otp:ingress:closed'],
    caveats:['Commands are a reviewed recipe, not executed by this plan.',
      'Probe returns a candidate hop count; it never changes OTP configuration or enables sending.',
      'A different egress IP family, NAT or proxy route is a blocker for automatic confirmation.',
      'Cloud build, image storage and function invocations can consume provider quotas.']}
}
async function save(name,data){const dir=resolve(ROOT,'.firebase/otp-ingress');await mkdir(dir,{recursive:true});await writeFile(resolve(dir,name),JSON.stringify(data,null,2)+'\n',{mode:0o600})}
async function changeWindow(local,value) {
  if(await readFile(local.path,'utf8')!==local.text)stop('Local parameters changed during preparation; re-plan before editing')
  const lines=local.text.split(/\r?\n/),indices=[]
  lines.forEach((line,i)=>{if(/^\s*(?:export\s+)?OTP_DIAGNOSTICS_WINDOW_START\s*=/.test(line))indices.push(i)})
  if(indices.length!==1)stop('Diagnostic window parameter is missing or duplicated')
  const dir=resolve(ROOT,'.firebase/otp-ingress/backups');await mkdir(dir,{recursive:true})
  await writeFile(resolve(dir,`parameters-${Date.now()}.env`),local.text,{flag:'wx',mode:0o600})
  const next=local.text.replace(/^(?:\uFEFF)?[ \t]*(?:export[ \t]+)?OTP_DIAGNOSTICS_WINDOW_START[ \t]*=[^\r\n]*/m,match=>(match.startsWith('\uFEFF')?'\uFEFF':'')+`OTP_DIAGNOSTICS_WINDOW_START=${value}`);const before=readOtpParameters(local.text),after=readOtpParameters(next)
  if(after.get('OTP_DIAGNOSTICS_WINDOW_START')!==value||before.size!==after.size||[...before].some(([key,value])=>key!=='OTP_DIAGNOSTICS_WINDOW_START'&&after.get(key)!==value))stop('Unexpected parameter change')
  await writeFile(local.path,next,'utf8')
}
async function main() {
  const [mode,...extra]=process.argv.slice(2);if(!['--plan','--open-window','--close-window'].includes(mode)||extra.length)stop('Use exactly --plan, --open-window or --close-window')
  const local=await localState()
  if(mode==='--close-window') {await changeWindow(local,'');console.log(JSON.stringify({diagnosticWindowClearedLocally:true,deploymentPerformed:false}));return}
  const identity=await firebaseDiagnosticIdentity()
  const {request}=await firebaseGoogleApi(PROJECT_ID)
  const inventory=await functionsInventory(request),state=await readSecretPreparation(request)
  const report=await buildClosedRolloutPlan({state,inventory,identity,localText:local.text})
  if(mode==='--open-window') {
    const start=new Date().toISOString();await changeWindow(local,start)
    console.log(JSON.stringify({diagnosticWindowStartedLocally:start,expiresAt:new Date(Date.parse(start)+30*60_000).toISOString(),deploymentPerformed:false,otpEnabled:false}));return
  }
  await save('closed-rollout-plan.json',{...report,verifiedAt:new Date().toISOString()})
  console.log(JSON.stringify(report,null,2))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error=>{console.error(formatOtpRolloutError(error));process.exitCode=1})
}
