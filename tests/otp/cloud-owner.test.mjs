import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readOwnerAccount, readOwnerFunctions, ownerCandidate, assertOwnerSelectors, assertOwnerBaseline, assertOwnerIngressEvidence, OWNER_STAGES } from '../../tools/prepare-otp-owner.mjs'
import { GoogleApiError } from '../../tools/otp-google-api.mjs'
import { readOtpParameters } from '../../tools/otp-aws-config.mjs'
const project = 'majstorsada-b2ad4', email = 'owner@example.com', uid = 'test_owner_uid'
const base = 'PUBLIC_WRITES_ENABLED=true\nJOB_MAINTENANCE_ENABLED=true\nOTP_ENABLED=false\nOTP_SEND_ENABLED=false\nOTP_PUBLIC_ENABLED=false\nOTP_TEST_EMAILS=\nOTP_TRUSTED_PROXY_HOPS=0\nOTP_DAILY_LIMIT=500\nOTP_DIAGNOSTICS_WINDOW_START=\nOTP_DIAGNOSTIC_GOOGLE_SUBJECT=123456789012345678901\nOTP_DIAGNOSTIC_GOOGLE_EMAIL=operator@example.com\n'
const missing = () => { throw new GoogleApiError(404, 'NOT_FOUND', 'firestore', '/v1/masked') }
function accountRequest(user, roles = []) {
 const calls = []
 return {calls, request: async (service, method, path, body) => {
  calls.push({service, method, path, body})
  if(service === 'identitytoolkit') return user ? {users: [user]} : {}
  const collection = path.split('/documents/')[1].split('/')[0]
  if(!roles.includes(collection)) return missing()
  return {name: path.slice(4).split('?')[0], fields: {uid: {stringValue: uid}}}
 }}
}
const validUser = () => ({localId: uid, email, emailVerified: true, customAttributes: '{"preserved":"value"}'})
function functionsFixture() {
 const entries = Object.fromEntries(readOtpParameters(base))
 const otp = ['requestClientOtp', 'verifyClientOtp'].map(name => ({name: `projects/${project}/locations/europe-west3/functions/${name}`, state:'ACTIVE', environment:'GEN_2', buildConfig:{runtime:'nodejs24'}, serviceConfig:{
  uri:`https://${name.toLowerCase()}-fixture-ey.a.run.app/`,service:`projects/${project}/locations/europe-west3/services/${name.toLowerCase()}`,serviceAccountEmail:`otp-runtime@${project}.iam.gserviceaccount.com`,availableMemory:'256Mi',availableCpu:'1',maxInstanceCount:2,maxInstanceRequestConcurrency:10,timeoutSeconds:60,ingressSettings:'ALLOW_ALL',environmentVariables:{...entries},
  secretEnvironmentVariables:(name==='requestClientOtp'?['OTP_HMAC_SECRET','OTP_TURNSTILE_SECRET']:['OTP_HMAC_SECRET']).map(key=>({key,version:'1',projectId:project})),
 }}))
 return [...otp,{name:`projects/${project}/locations/europe-west3/functions/maintainJobs`,state:'ACTIVE',environment:'GEN_2',labels:{'firebase-functions-codebase':'api','deployment-scheduled':'true'},serviceConfig:{timeoutSeconds:300,maxInstanceCount:1,maxInstanceRequestConcurrency:1,environmentVariables:{PUBLIC_WRITES_ENABLED:'true',JOB_MAINTENANCE_ENABLED:'true'}}},
 {name:`projects/${project}/locations/europe-west3/functions/server`,state:'ACTIVE',environment:'GEN_2',labels:{'firebase-functions-codebase':'nuxt-ssr'}}]
}

test('An absent nominated Auth account is eligible for a new client without any profile creation or enumeration', async () => {
 const fixture=accountRequest();assert.deepEqual(await readOwnerAccount(fixture.request,email),{kind:'new-client',uid:null,claimsDigest:null})
 assert.equal(fixture.calls.length,1);assert.equal(fixture.calls[0].method,'POST');assert.deepEqual(fixture.calls[0].body,{email:[email]})
 assert.match(fixture.calls[0].path,/\?fields=users\(localId,email,emailVerified,disabled,mfaInfo\(mfaEnrollmentId\),customAttributes\)$/)
})
test('Existing owner client lookup keeps UID and only a fingerprint of claims while reading exactly three masked role records', async () => {
 const fixture=accountRequest(validUser(),['clients']),result=await readOwnerAccount(fixture.request,email)
 assert.equal(result.kind,'existing-client');assert.equal(result.uid,uid);assert.match(result.claimsDigest,/^[a-f0-9]{64}$/)
 assert.ok(!JSON.stringify(result).includes('preserved'));assert.equal(fixture.calls.length,4)
 assert.ok(fixture.calls.slice(1).every(call=>call.method==='GET'&&call.path.endsWith('/'+uid+'?mask.fieldPaths=uid')))
})
test('Privileged, conflicting, disabled, unverified and MFA accounts stop owner preparation', async () => {
 for(const roles of [['admins'],['tradespeople'],['admins','clients']]) {const fixture=accountRequest(validUser(),roles);await assert.rejects(()=>readOwnerAccount(fixture.request,email))}
 for(const values of [{disabled:true},{disabled:'false'},{emailVerified:false},{mfaInfo:[{mfaEnrollmentId:'factor'}]},{mfaInfo:{}},{email:'other@example.com'},{localId:'unsafe/path'},{customAttributes:'[]'},{customAttributes:'invalid'}]) {
  const fixture=accountRequest({...validUser(),...values});await assert.rejects(()=>readOwnerAccount(fixture.request,email));assert.equal(fixture.calls.length,1)
 }
})
test('Unregistered verified client identity remains eligible and malformed lookup/profile responses fail closed', async () => {
 assert.equal((await readOwnerAccount(accountRequest(validUser()).request,email)).kind,'existing-unregistered')
 await assert.rejects(()=>readOwnerAccount(async()=>({users:[validUser(),validUser()]}),email))
 await assert.rejects(()=>readOwnerAccount(async()=>({users:{}}),email))
 const fixture=accountRequest(validUser(),['clients']);await assert.rejects(()=>readOwnerAccount(async(...args)=>{const data=await fixture.request(...args);if(args[0]==='firestore')data.fields.uid.stringValue='different';return data},email))
 for(const bad of ['Owner@example.com','owner@example.com\nOTP_PUBLIC_ENABLED=true','a@example.com,b@example.com','a@example.com '])await assert.rejects(()=>readOwnerAccount(()=>assert.fail('No network expected'),bad))
})
test('Owner candidate changes exactly four gates and keeps existing business flags, public closure, quotas and diagnostic pins byte for byte',()=>{
 const next=ownerCandidate(base,email),before=readOtpParameters(base),after=readOtpParameters(next)
 const changed=[...before].filter(([key,value])=>after.get(key)!==value).map(([key])=>key).sort()
 assert.deepEqual(changed,['OTP_ENABLED','OTP_SEND_ENABLED','OTP_TEST_EMAILS','OTP_TRUSTED_PROXY_HOPS'].sort())
 assert.equal(after.get('OTP_PUBLIC_ENABLED'),'false');assert.equal(after.get('OTP_DAILY_LIMIT'),'500');assert.equal(after.get('OTP_DIAGNOSTICS_WINDOW_START'),'')
 assert.ok(next.startsWith('PUBLIC_WRITES_ENABLED=true\nJOB_MAINTENANCE_ENABLED=true\n'))
})
test('Owner staging refuses already active gates, diagnostics, ambiguous assignment or multiple addresses',()=>{
 for(const old of [base.replace('OTP_ENABLED=false','OTP_ENABLED=true'),base.replace('OTP_SEND_ENABLED=false','OTP_SEND_ENABLED=true'),base.replace('OTP_PUBLIC_ENABLED=false','OTP_PUBLIC_ENABLED=true'),base.replace('OTP_DAILY_LIMIT=500','OTP_DAILY_LIMIT=501'),base.replace('OTP_DIAGNOSTICS_WINDOW_START=','OTP_DIAGNOSTICS_WINDOW_START=2026-10-06T12:00:00.000Z'),base+'OTP_ENABLED=false\n'])assert.throws(()=>ownerCandidate(old,email))
 assert.throws(()=>ownerCandidate(base,'one@example.com,two@example.com'))
})
test('Owner selectors resolve exactly maintenance, SSR and two OTP exports without broad API deployment',()=>{
 const config={functions:[{source:'functions',codebase:'api'},{source:'.output/server',codebase:'nuxt-ssr'}]},ids={api:['requestClientOtp','verifyClientOtp','maintainJobs','health','createJob'],'nuxt-ssr':['server']}
 assertOwnerSelectors(config,ids);assert.equal(OWNER_STAGES.at(-1),'functions:api:requestClientOtp,functions:api:verifyClientOtp')
 assert.throws(()=>assertOwnerSelectors(config,{...ids,api:[...ids.api,'maintainJobs-extra']}))
 assert.throws(()=>assertOwnerSelectors({...config,functions:[{source:'functions',codebase:'api'}]},ids))
})
test('Remote closed gate, AWS pins, secret version and scheduler business drift stop the plan',()=>{
 const rows=functionsFixture();assertOwnerBaseline(rows,readOtpParameters(base))
 for(const change of [r=>r[0].serviceConfig.environmentVariables.OTP_ENABLED='true',r=>r[0].serviceConfig.environmentVariables.OTP_DAILY_LIMIT='501',r=>r[0].serviceConfig.secretEnvironmentVariables[0].version='2',r=>r[1].serviceConfig.maxInstanceCount=3,r=>r[2].serviceConfig.environmentVariables.PUBLIC_WRITES_ENABLED='false',r=>r[2].serviceConfig.timeoutSeconds=60]){const next=structuredClone(rows);change(next);assert.throws(()=>assertOwnerBaseline(next,readOtpParameters(base)))}
})
test('All-region inventory follows pages, rejects repeated/invalid tokens and never accepts inactive or foreign functions',async()=>{
 const rows=functionsFixture(),calls=[]
 const data=await readOwnerFunctions(async(service,method,path)=>{calls.push(path);return calls.length===1?{functions:rows.slice(0,2),nextPageToken:'opaque/+=='}:{functions:rows.slice(2)}})
 assert.equal(data.length,4);assert.match(calls[0],/locations\/-\/functions/);assert.match(calls[1],/pageToken=opaque%2F%2B%3D%3D/)
 for(const response of [{unreachable:['region']},{functions:[{...rows[0],state:'FAILED'}]},{functions:[{...rows[0],name:rows[0].name.replace(project,'foreign')}]},{functions:[rows[0],rows[0]]},{nextPageToken:'bad token'}])await assert.rejects(()=>readOwnerFunctions(async()=>response))
 await assert.rejects(()=>readOwnerFunctions(async()=>({nextPageToken:'same'})))
})
test('Ingress preparation requires all six surfaces with the complete spoof-rejection proof',()=>{
 const rows=functionsFixture(),probe={projectId:project,region:'europe-west3',candidateTrustedProxyHops:1,status:'candidate_requires_operator_review',routes:['requestClientOtp','verifyClientOtp'].flatMap(fn=>['cloudfunctions','run-hash','run-deterministic'].map(surface=>({function:fn,surface,requests:5,spoofedPrefixesRejected:true,forwardedCounts:[1,2,2,4,2]})))}
 assertOwnerIngressEvidence(probe,rows)
 for(const change of [p=>p.candidateTrustedProxyHops=0,p=>p.routes.pop(),p=>p.routes[0].spoofedPrefixesRejected=false,p=>p.routes[1].surface='cloudfunctions']){const next=structuredClone(probe);change(next);assert.throws(()=>assertOwnerIngressEvidence(next,rows))}
})
