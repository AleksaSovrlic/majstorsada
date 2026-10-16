import assert from 'node:assert/strict'
import {test}from'node:test'
import {assertScopedOtpSelector,assertClosedRuntimeManifest,assertInactiveDiagnosticPins,readFrontendOtpFlags,buildClosedRolloutPlan,CLOSED_OTP_SELECTOR,formatOtpRolloutError,OtpRolloutError,assertDeploymentParameterCoverage}from'../../tools/prepare-otp-ingress.mjs'
import {DiagnosticAuthError}from'../../tools/otp-diagnostic-auth.mjs'
import {GoogleApiError}from'../../tools/otp-google-api.mjs'
const owner={actor:'operator@example.com',subject:'123456789012345678901'}
const local=`OTP_DIAGNOSTICS_WINDOW_START=\nOTP_DIAGNOSTIC_GOOGLE_EMAIL=${owner.actor}\nOTP_DIAGNOSTIC_GOOGLE_SUBJECT=${owner.subject}\n`
const config={functions:[{source:'functions',codebase:'api'},{source:'.output/server',codebase:'nuxt-ssr'}]}
function manifest(){const endpoint=secrets=>({platform:'gcfv2',region:['europe-west3'],serviceAccountEmail:{toJSON:()=> 'params.OTP_RUNTIME_SERVICE_ACCOUNT'},minInstances:0,maxInstances:2,concurrency:10,availableMemoryMb:256,timeoutSeconds:60,httpsTrigger:{invoker:['public']},secretEnvironmentVariables:secrets.map(key=>({key}))});return{requestClientOtp:{__endpoint:endpoint(['OTP_HMAC_SECRET','OTP_TURNSTILE_SECRET'])},verifyClientOtp:{__endpoint:endpoint(['OTP_HMAC_SECRET'])}}}
const params=Object.entries({OTP_ENABLED:false,OTP_PUBLIC_ENABLED:false,OTP_TRUSTED_PROXY_HOPS:0,OTP_DAILY_LIMIT:500,OTP_DIAGNOSTICS_WINDOW_START:'',OTP_DIAGNOSTIC_GOOGLE_SUBJECT:'',OTP_DIAGNOSTIC_GOOGLE_EMAIL:''}).map(([name,value])=>({name,default:value}))
test('Pinned Firebase CLI selectors target exactly two OTP API exports',()=>{assert.equal(assertScopedOtpSelector(config,['requestClientOtp','verifyClientOtp','health','createJob','server']),CLOSED_OTP_SELECTOR);assert.throws(()=>assertScopedOtpSelector(config,['requestClientOtp','verifyClientOtp','requestClientOtp-extra']));assert.throws(()=>assertScopedOtpSelector({functions:[{source:'functions',codebase:'wrong'}]},['requestClientOtp','verifyClientOtp']))})
test('Closed runtime manifest refuses expanded resources, secret bindings or open defaults',()=>{assertClosedRuntimeManifest(manifest(),params);for(const [property,value]of [['minInstances',1],['maxInstances',3],['concurrency',80],['availableMemoryMb',512]]){const runtime=manifest();runtime.requestClientOtp.__endpoint[property]=value;assert.throws(()=>assertClosedRuntimeManifest(runtime,params))}const runtime=manifest();runtime.verifyClientOtp.__endpoint.secretEnvironmentVariables.push({key:'OTP_TURNSTILE_SECRET'});assert.throws(()=>assertClosedRuntimeManifest(runtime,params));assert.throws(()=>assertClosedRuntimeManifest(manifest(),params.map(item=>item.name==='OTP_ENABLED'?{...item,default:true}:item)))})
test('Owner pins are checked independently from a blank diagnostic window',()=>{assertInactiveDiagnosticPins(local,owner);assert.throws(()=>assertInactiveDiagnosticPins(local,{...owner,subject:'different'}));assert.throws(()=>assertInactiveDiagnosticPins(local.replace('WINDOW_START=','WINDOW_START=2026-10-05T12:00:00.000Z'),owner))})
test('Frontend OTP flags are unambiguous while unrelated existing Nuxt assignments retain their parsing semantics',()=>{const text='NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET=one\nNUXT_PUBLIC_FIREBASE_STORAGE_BUCKET=two\nNUXT_PUBLIC_AUTH_MODE=magic-link\nNUXT_PUBLIC_TURNSTILE_SITE_KEY=public\n';const flags=readFrontendOtpFlags(text);assert.equal(flags.get('NUXT_PUBLIC_AUTH_MODE'),'magic-link');assert.equal(flags.size,2);assert.throws(()=>readFrontendOtpFlags(text+'NUXT_PUBLIC_AUTH_MODE=otp\n'));assert.throws(()=>readFrontendOtpFlags('NUXT_PUBLIC_AUTH_MODE=magic-link\n'))})
test('Cloud prerequisites and existing OTP deployments block initial publication planning',async()=>{const data={state:{status:'verified',actions:[],blockers:[]},inventory:[{name:'projects/project/locations/region/functions/health'}],identity:owner,localText:local};const report=await buildClosedRolloutPlan(data);assert.equal(report.deploymentPerformed,false);assert.equal(report.newIamGrants,0);assert.equal(report.otpEnabled,false);assert.equal(report.existingFunctions,1);assert.equal(report.nextCommands.length,6);assert.match(report.nextCommands.at(-1),/otp:ingress:closed/);await assert.rejects(()=>buildClosedRolloutPlan({...data,state:{status:'verified',actions:['grant'],blockers:[]}}));await assert.rejects(()=>buildClosedRolloutPlan({...data,inventory:[{name:'projects/project/locations/region/functions/requestClientOtp'}]}))})


test('Rollout failures preserve only actionable known auth, API and filesystem codes',()=>{
  assert.equal(formatOtpRolloutError(new OtpRolloutError('Close the diagnostic window.')),'Close the diagnostic window.')
  assert.equal(formatOtpRolloutError(new DiagnosticAuthError('AUTHENTICATION_UNAVAILABLE')),'Diagnostic operator authentication failed (AUTHENTICATION_UNAVAILABLE)')
  assert.equal(formatOtpRolloutError(new GoogleApiError(403,'PERMISSION_DENIED','secretmanager','/v1/private-path')),'Google OTP prerequisite request failed (403; PERMISSION_DENIED)')
  assert.equal(formatOtpRolloutError(new GoogleApiError(0,'AUTH_UNAVAILABLE','functions','/v2/private-path')),'Google OTP prerequisite request failed (network; AUTH_UNAVAILABLE)')
  for(const code of ['EACCES','EPERM','EBUSY','ENOSPC'])assert.equal(formatOtpRolloutError(Object.assign(new Error('private filesystem details'),{code,path:'private-path'})),'OTP rollout preparation file operation failed ('+code+'); review prerequisites without changing deployment')
})

test('Rollout failure formatting never reveals arbitrary messages, malformed codes, paths or causes',()=>{
  const generic='OTP rollout preparation failed; review prerequisites without changing deployment'
  const privateValue='mock-private-token-and-provider-body'
  const failures=[new Error(privateValue),Object.assign(new Error(privateValue),{code:'ENOENT',path:privateValue,cause:new Error(privateValue)}),new DiagnosticAuthError(privateValue),new GoogleApiError(403,privateValue,'functions',privateValue),new GoogleApiError(999,'PERMISSION_DENIED','functions',privateValue),new GoogleApiError('403','PERMISSION_DENIED','functions',privateValue),null]
  for(const error of failures){const result=formatOtpRolloutError(error);assert.equal(result,generic);assert.ok(!result.includes(privateValue))}
  const known=new GoogleApiError(403,'PERMISSION_DENIED',privateValue,privateValue);known.cause=new Error(privateValue)
  assert.equal(formatOtpRolloutError(known),'Google OTP prerequisite request failed (403; PERMISSION_DENIED)')
})


test('Non-interactive deployment requires explicit boolean and empty-string parameters despite SDK defaults',()=>{
  const parameters=[{name:'OTP_SEND_ENABLED',type:'boolean',default:true},{name:'OTP_TEST_EMAILS',type:'string',default:''},{name:'EXISTING_BUSINESS_PARAM',type:'string',default:'existing'}]
  const complete=new Map([['OTP_SEND_ENABLED','false'],['OTP_TEST_EMAILS',''],['EXISTING_BUSINESS_PARAM','existing']])
  assertDeploymentParameterCoverage(parameters,complete)
  for(const key of complete.keys()) {
    const missing=new Map(complete);missing.delete(key)
    assert.throws(()=>assertDeploymentParameterCoverage(parameters,missing),{name:'Error',message:'Missing explicit deployment parameters: '+key})
  }
  assert.throws(()=>assertDeploymentParameterCoverage(parameters,new Map()),{message:'Missing explicit deployment parameters: EXISTING_BUSINESS_PARAM, OTP_SEND_ENABLED, OTP_TEST_EMAILS'})
})

test('Deployment coverage excludes secret values and reveals only validated missing parameter names',()=>{
  const parameters=[{name:'OTP_HMAC_SECRET',type:'secret'},{name:'OTP_TURNSTILE_SECRET',type:'secret'},{name:'OTP_ENABLED',type:'boolean',default:false}]
  assertDeploymentParameterCoverage(parameters,new Map([['OTP_ENABLED','false']]))
  assert.throws(()=>assertDeploymentParameterCoverage(parameters,new Map()),{message:'Missing explicit deployment parameters: OTP_ENABLED'})
  const privateValue='mock-private-token-or-path'
  for(const name of [privateValue,'OTP_PARAM'+String.fromCharCode(10)+privateValue,undefined]) {
    assert.throws(()=>assertDeploymentParameterCoverage([{name,type:'string',default:privateValue}],new Map()),{message:'Invalid deployment parameter name'})
  }
})
