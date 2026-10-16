import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
const require=createRequire(new URL('../../functions/package.json',import.meta.url))
const {createOtpDiagnostics,isOtpDiagnosticWindowOpen,canonicalOtpDiagnosticIp,parseOtpDiagnosticForwarded}=require('./lib/otpDiagnostics.js')
const {createOtpHandler}=require('./lib/otpHttp.js')
const subject='123456789012345678901', email='operator@example.com', token='synthetic-identity-token', nonce=Buffer.alloc(32,7).toString('base64url')
let fixtureTime=Date.parse('2026-10-05T12:00:00.000Z')
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
function fixture(overrides={}) {
  fixtureTime+=60_001
  let time=fixtureTime,calls=0
  const config={windowStartedAt:()=>new Date(fixtureTime).toISOString(),ownerSubject:()=>subject,ownerEmail:()=>email,
    businessEnabled:()=>false,publicEnabled:()=>false,now:()=>time,
    fetch:async(url,options)=>{calls++;assert.equal(url,'https://openidconnect.googleapis.com/v1/userinfo');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,`Bearer ${token}`);assert.ok(options.signal);return json({sub:subject,email,email_verified:true})},...overrides}
  return {config,handler:createOtpDiagnostics(config),calls:()=>calls,setTime:value=>{time=value},time:()=>time}
}
function request(extra={},body={diagnostic:'ingress-v1',nonce}) {
  const headers={'content-type':'application/json','x-otp-diagnostic':'ingress-v1',authorization:`Bearer ${token}`,origin:'https://majstorsada.rs',...extra}
  return {method:'POST',body,get:key=>headers[key.toLowerCase()],socket:{remoteAddress:'::ffff:127.0.0.1'}}
}
function response(){return{headers:{},statusCode:0,setHeader(key,value){this.headers[key]=value},status(code){this.statusCode=code;return this},send(body){this.body=body;return this}}}
async function rejected(handler,req,code){await assert.rejects(()=>handler(req,response()),error=>{assert.equal(error.code,code);assert.ok(!error.message.includes(token));assert.ok(!error.message.includes('private-error'));return true})}

test('Diagnostic window has one canonical UTC start and a hard 30-minute lifetime',()=>{
  const start='2026-10-05T12:00:00.000Z',time=Date.parse(start)
  assert.equal(isOtpDiagnosticWindowOpen(start,time),true)
  assert.equal(isOtpDiagnosticWindowOpen(start,time+1_799_999),true)
  for(const [value,now]of [['',time],[start,time-1],[start,time+1_800_000],['2026-10-05T12:00:00Z',time],['2026-02-30T12:00:00.000Z',time],[start,NaN]])assert.equal(isOtpDiagnosticWindowOpen(value,now),false)
})
test('IP diagnostic preserves invalid prefix positions without reflecting caller text',()=>{
  assert.deepEqual(parseOtpDiagnosticForwarded('not-an-ip, 198.51.100.1, 2001:0DB8:0:0::1'),[null,'198.51.100.1','2001:db8::1'])
  assert.equal(canonicalOtpDiagnosticIp('::ffff:192.0.2.1'),'192.0.2.1')
  for(const value of ['untrusted','fe80::1%eth0','',[],123])assert.equal(canonicalOtpDiagnosticIp(value),null)
  assert.deepEqual(parseOtpDiagnosticForwarded(undefined),[])
  assert.throws(()=>parseOtpDiagnosticForwarded('x'.repeat(1025)))
  assert.throws(()=>parseOtpDiagnosticForwarded(Array(33).fill('1.1.1.1').join(',')))
})
test('Default, expired, future, enabled and unpinned diagnostics reject before network work',async()=>{
  const scenarios=[{windowStartedAt:()=>''},{windowStartedAt:()=>new Date(fixtureTime-2_000_000).toISOString()},
    {windowStartedAt:()=>new Date(fixtureTime+1).toISOString()},{businessEnabled:()=>true},{publicEnabled:()=>true},{ownerSubject:()=>''},{ownerEmail:()=>''}]
  for(const overrides of scenarios){const f=fixture(overrides);await rejected(f.handler,request(),'unavailable');assert.equal(f.calls(),0)}
})
test('Only an authenticated pinned owner receives a transient ingress response',async()=>{
  const f=fixture(),res=response()
  await f.handler(request({'x-forwarded-for':'caller-text, 198.51.100.15, 2001:DB8::10','cf-connecting-ip':'203.0.113.99'}),res)
  assert.deepEqual(res.body,{ok:true,diagnostic:'ingress-v1',nonce,forwarded:[null,'198.51.100.15','2001:db8::10'],socketIp:'127.0.0.1'})
  assert.equal(res.headers['Cache-Control'],'private, no-store')
  assert.ok(!JSON.stringify(res).includes(token));assert.ok(!JSON.stringify(res).includes('caller-text'))
  assert.equal(f.calls(),1)
})
test('Malformed bodies and authorization are denied without any Google lookup',async()=>{
  for(const auth of [undefined,'Basic x','Bearer x y',`Bearer ${'x'.repeat(4097)}`]){const f=fixture();await rejected(f.handler,request({authorization:auth}),'unauthenticated');assert.equal(f.calls(),0)}
  for(const body of [{diagnostic:'ingress-v1',nonce,extra:1},{diagnostic:'other',nonce},{diagnostic:'ingress-v1',nonce:'bad'},[]]){const f=fixture();await rejected(f.handler,request({},body),'invalid-argument');assert.equal(f.calls(),0)}
  const f=fixture(),req=request();req.rawBody=Buffer.alloc(1025);await rejected(f.handler,req,'invalid-argument');assert.equal(f.calls(),0)
})
test('Changing subject, email or verified-email claim cannot authorize diagnostics',async()=>{
  for(const user of [{sub:'another',email,email_verified:true},{sub:subject,email:'other@example.com',email_verified:true},{sub:subject,email,email_verified:false},{sub:subject,email,email_verified:'true'}]){
    const f=fixture({fetch:async()=>json(user)});await rejected(f.handler,request(),'permission-denied')
  }
})
test('Google rejects, oversized replies, network errors and malformed JSON stay sanitized',async()=>{
  for(const [fetch,code]of [[async()=>json({},401),'unauthenticated'],[async()=>json({detail:'private-error'},403),'unavailable'],
    [async()=>{throw new Error('private-error '+token)},'unavailable'],[async()=>new Response('private-error',{headers:{'content-type':'application/json'}}),'unavailable'],
    [async()=>json({padding:'x'.repeat(9000)}),'unavailable'],[async()=>new Response('{}',{headers:{'content-type':'text/html'}}),'unavailable']]){
    const f=fixture({fetch});await rejected(f.handler,request(),'unavailable'===code?code:code)
  }
})
test('Diagnostic expiry and business gates are checked again after owner authentication',async()=>{
  let enabled=false,f
  f=fixture({businessEnabled:()=>enabled,fetch:async()=>{enabled=true;return json({sub:subject,email,email_verified:true})}})
  await rejected(f.handler,request(),'unavailable')
  f=fixture({fetch:async()=>{f.setTime(f.time()+1_800_000);return json({sub:subject,email,email_verified:true})}})
  await rejected(f.handler,request(),'unavailable')
})
test('A warm-instance brake bounds Google calls across both diagnostic factories',async()=>{
  let calls=0;const f=fixture({fetch:async()=>{calls++;return json({},401)}}),other=createOtpDiagnostics(f.config)
  for(let i=0;i<20;i++)await rejected(i%2?other:f.handler,request(),'unauthenticated')
  await rejected(f.handler,request(),'resource-exhausted');assert.equal(calls,20)
  f.setTime(f.time()+60_000);await rejected(other,request(),'unauthenticated');assert.equal(calls,21)
})
test('Demo/emulator state never turns into production diagnostic authority',async t=>{
  const prior=process.env.FUNCTIONS_EMULATOR;process.env.FUNCTIONS_EMULATOR='true'
  t.after(()=>{if(prior===undefined)delete process.env.FUNCTIONS_EMULATOR;else process.env.FUNCTIONS_EMULATOR=prior})
  const f=fixture();await rejected(f.handler,request(),'unavailable');assert.equal(f.calls(),0)
})
test('Actual OTP boundary preserves origin/method policy and never falls through after diagnostics',async()=>{
  const f=fixture();let expensive=0
  const handler=createOtpHandler({operation:'request',enabled:()=>false,diagnostics:f.handler,
    serviceFactory:()=>{expensive++;throw new Error('unexpected service')},verifyBot:async()=>{expensive++;throw new Error('unexpected bot')}})
  const res=response();await handler(request({'x-forwarded-for':'198.51.100.15'}),res);assert.equal(res.statusCode,200);assert.equal(expensive,0)
  const bad=response();await handler(request({origin:'https://foreign.example'}),bad);assert.equal(bad.statusCode,403);assert.equal(f.calls(),1)
  const ordinary=response();await handler(request({'x-otp-diagnostic':undefined}),ordinary);assert.equal(ordinary.statusCode,503);assert.equal(f.calls(),1);assert.equal(expensive,0)
  const wrongMethod=request();wrongMethod.method='GET';const get=response();await handler(wrongMethod,get);assert.equal(get.statusCode,405)
  const noAuth=response();await handler(request({authorization:undefined}),noAuth);assert.equal(noAuth.statusCode,401);assert.equal(expensive,0)
})

// A provider error object must never become a response message, even if its type
// resembles the fixed errors used by this boundary.
test('Transport HttpsError messages cannot leak through diagnostic authorization',async()=>{
  const {HttpsError}=require('firebase-functions/v2/https')
  for(const code of ['unauthenticated','permission-denied']) {
    const f=fixture({fetch:async()=>{throw new HttpsError(code,'private-error '+token)}})
    await rejected(f.handler,request(),code)
  }
})
