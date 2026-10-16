import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {readOwnerIndexBaseline,inspectOwnerIndexes,normalizeOwnerIndex} from '../../tools/otp-owner-indexes.mjs'
const RESOURCE='projects/majstorsada-b2ad4/databases/(default)/collectionGroups/'
const manifest=JSON.parse(readFileSync(new URL('../../firestore.indexes.json',import.meta.url),'utf8'))
const clone=value=>structuredClone(value)
function composite(spec,i=0) {
  const value=clone(spec),last=value.fields.at(-1)
  value.name=RESOURCE+spec.collectionGroup+'/indexes/index_'+i
  value.fields.push({fieldPath:'__name__',order:last.order||'ASCENDING'})
  value.state='READY'; delete value.collectionGroup
  return value
}
function metadataField(spec,inherited=false) {
  return {name:RESOURCE+spec.collectionGroup+'/fields/'+spec.fieldPath,
    indexConfig:{usesAncestorConfig:inherited,indexes:spec.indexes.map(index=>({queryScope:index.queryScope,
      fields:[{fieldPath:spec.fieldPath,...(index.order?{order:index.order}:{arrayConfig:index.arrayConfig})}],state:'READY'}))}}
}
function ready() {return {indexes:manifest.indexes.map(composite),fields:manifest.fieldOverrides.map(item=>metadataField(item))}}
function onlyBusiness() {const value=ready();value.fields=value.fields.filter(item=>!item.name.includes('/_otp'));return value}
function assertNoReady(baseline) {const result=inspectOwnerIndexes(manifest,baseline);assert.equal(result.ready,false);return result}

test('Exact ready metadata preserves all 15 business indexes and both field overrides with zero OTP actions',()=>{
  const result=inspectOwnerIndexes(manifest,ready())
  assert.equal(result.ready,true);assert.equal(result.businessPreserved,true);assert.deepEqual(result.otpActions,[])
  assert.deepEqual(result.blockers,[]);assert.equal(result.extraRemoteCompositeIndexes,0);assert.equal(result.extraRemoteFieldOverrides,0)
  assert.equal(result.requiresForce,false);assert.equal(result.deleteRemoteExtras,false)
})
test('Firestore auto-added composite name suffix is removed while explicit reverse ordering remains distinguishable',()=>{
  const index=composite(manifest.indexes[0]);assert.deepEqual(normalizeOwnerIndex(index),normalizeOwnerIndex(manifest.indexes[0],false))
  index.fields.at(-1).order='DESCENDING'
  assert.notDeepEqual(normalizeOwnerIndex(index),normalizeOwnerIndex(manifest.indexes[0],false))
})
test('Missing business composite indexes and non-ready states block unrelated creation during an OTP deploy',()=>{
  const missing=ready();missing.indexes.pop();assert.equal(assertNoReady(missing).businessPreserved,false)
  for(const state of ['CREATING','NEEDS_REPAIR','STATE_UNSPECIFIED']) {
    const value=ready();value.indexes[0].state=state;assert.equal(assertNoReady(value).businessPreserved,false)
  }
})
test('Business field scope, mode, explicit inheritance or readiness drift blocks unrelated field patches',()=>{
  for(const mutate of [value=>value.indexConfig.indexes[0].queryScope='COLLECTION',
    value=>value.indexConfig.indexes[0].fields[0].order='DESCENDING',
    value=>value.indexConfig.usesAncestorConfig=true,value=>value.indexConfig.reverting=true,
    value=>value.indexConfig.indexes[0].state='CREATING']) {
    const baseline=ready();mutate(baseline.fields[0]);assert.equal(assertNoReady(baseline).businessPreserved,false)
  }
})
test('Missing or inherited OTP defaults produce exactly five index-only actions and leave business metadata untouched',()=>{
  const result=inspectOwnerIndexes(manifest,onlyBusiness());assert.equal(result.ready,false);assert.equal(result.businessPreserved,true)
  assert.equal(result.otpActions.length,5);assert.ok(result.otpActions.every(item=>item.action==='update-index-config-only'&&!Object.hasOwn(item,'ttl')))
  assert.deepEqual(result.blockers,[])
  const inherited=ready();for(const item of inherited.fields.filter(item=>item.name.includes('/_otp'))) item.indexConfig.usesAncestorConfig=true
  assert.equal(assertNoReady(inherited).otpActions.length,5)
})
test('An OTP expiry index requires exactly COLLECTION ASCENDING and READY without accepting inherited or broader modes',()=>{
  for(const mutate of [item=>item.indexConfig.indexes[0].queryScope='COLLECTION_GROUP',
    item=>item.indexConfig.indexes[0].fields[0].order='DESCENDING',
    item=>item.indexConfig.indexes[0].state='CREATING',
    item=>item.indexConfig.indexes.push(clone(item.indexConfig.indexes[0]))]) {
    const baseline=ready();mutate(baseline.fields.find(item=>item.name.endsWith('/_otpChallenges/fields/deleteAfter')))
    assert.equal(assertNoReady(baseline).otpActions.length,1)
  }
})
test('Extra remote business indexes and overrides are explicitly retained without force or deletion',()=>{
  const baseline=ready();baseline.indexes.push(composite({collectionGroup:'jobs',queryScope:'COLLECTION',fields:[{fieldPath:'legacy',order:'ASCENDING'},{fieldPath:'createdAt',order:'DESCENDING'}]},99))
  baseline.fields.push(metadataField({collectionGroup:'legacyRecords',fieldPath:'expiresAt',indexes:[]}))
  const result=inspectOwnerIndexes(manifest,baseline)
  assert.equal(result.ready,true);assert.equal(result.extraRemoteCompositeIndexes,1);assert.equal(result.extraRemoteFieldOverrides,1)
  assert.equal(result.deleteRemoteExtras,false);assert.equal(result.requiresForce,false)
})
test('TTL cannot be auto-enabled or silently changed and unexpected OTP overrides/composites block rollout',()=>{
  const ttlLocal=clone(manifest);ttlLocal.fieldOverrides.at(-1).ttl=true;assert.throws(()=>inspectOwnerIndexes(ttlLocal,ready()),/unsupported metadata schema/)
  const baseline=ready();baseline.fields.at(-1).ttlConfig={state:'ACTIVE'}
  assert.ok(assertNoReady(baseline).blockers.includes('OTP TTL configuration requires separate approval'))
  const unexpected=ready();unexpected.fields.push(metadataField({collectionGroup:'_otpChallenges',fieldPath:'codeHash',indexes:[]}))
  assert.ok(assertNoReady(unexpected).blockers.includes('unexpected OTP field override'))
  const compositeOtp=ready();compositeOtp.indexes.push(composite({collectionGroup:'_otpChallenges',queryScope:'COLLECTION',fields:[{fieldPath:'email',order:'ASCENDING'},{fieldPath:'expiresAt',order:'ASCENDING'}]},99))
  assert.ok(assertNoReady(compositeOtp).blockers.includes('unexpected OTP composite index'))
})
test('Default false and empty list protobuf omissions preserve explicit wildcard exemptions',()=>{
  const baseline=ready();for(const item of baseline.fields.filter(item=>item.name.endsWith('/fields/*'))) item.indexConfig={}
  assert.equal(inspectOwnerIndexes(manifest,baseline).ready,true)
})
test('Metadata schemas reject foreign resources, private data, unsafe modes and incomplete snapshots',()=>{
  for(const mutate of [value=>value.indexes[0].name=value.indexes[0].name.replace('majstorsada-b2ad4','foreign'),
    value=>value.fields[0].name=value.fields[0].name.replace('majstorsada-b2ad4','foreign'),
    value=>value.indexes[0].fields[0].passwordHash='private',value=>value.indexes[0].apiScope='DATASTORE_MODE_API',
    value=>value.fields[0].indexConfig.usesAncestorConfig='false',value=>delete value.fields[0].indexConfig,
    value=>value.fields[0].indexConfig.indexes[0].fields.push({fieldPath:'__name__',order:'ASCENDING'}),
    value=>delete value.indexes,value=>delete value.fields,value=>value.indexes.push(clone(value.indexes[0]))]) {
    const baseline=ready();mutate(baseline);assert.throws(()=>inspectOwnerIndexes(manifest,baseline),/OTP owner index preflight/)
  }
})
test('Local index file remains within five OTP overrides and approved business counts without duplicate definitions',()=>{
  for(const mutate of [value=>value.indexes.pop(),value=>value.fieldOverrides.pop(),
    value=>value.indexes.push(clone(value.indexes[0])),value=>value.fieldOverrides[2].indexes.push({queryScope:'COLLECTION',order:'ASCENDING'}),
    value=>value.fieldOverrides[2].ttl=false]) {
    const local=clone(manifest);mutate(local);assert.throws(()=>inspectOwnerIndexes(local,ready()),/OTP owner index preflight/)
  }
})
test('Index baseline follows every fixed bounded metadata page and preserves complete raw states',async()=>{
  const baseline=ready(),calls=[]
  const result=await readOwnerIndexBaseline(async(service,method,path,body)=>{
    calls.push(path);assert.equal(service,'firestore');assert.equal(method,'GET');assert.equal(body,undefined)
    const query=new URL('https://firestore.googleapis.com'+path).searchParams
    assert.equal(query.get('pageSize'),'0')
    const kind=path.includes('/indexes?')?'indexes':'fields'
    if(kind==='fields')assert.equal(query.get('filter'),'indexConfig.usesAncestorConfig=false OR ttlConfig:*')
    assert.equal(path.includes('majstorsada-b2ad4/databases/(default)/collectionGroups/-/'),true)
    const continuation=query.get('pageToken')
    if(!continuation)return {[kind]:baseline[kind].slice(0,1),nextPageToken:'opaque+/=token'}
    assert.equal(continuation,'opaque+/=token');return {[kind]:baseline[kind].slice(1)}
  })
  assert.deepEqual(result,baseline);assert.equal(calls.length,4)
  const maximum={indexes:Array.from({length:1000},(_,i)=>composite(manifest.indexes[0],i)),
    fields:Array.from({length:1000},(_,i)=>metadataField({collectionGroup:'legacyRecords',fieldPath:'field_'+i,indexes:[]}))}
  const complete=await readOwnerIndexBaseline(async(_service,_method,path)=>{
    const kind=path.includes('/indexes?')?'indexes':'fields'
    assert.equal(new URL('https://firestore.googleapis.com'+path).searchParams.get('pageSize'),'0')
    return {[kind]:maximum[kind]}
  })
  assert.deepEqual(complete,maximum)
})
test('Repeated, invalid or excessive metadata pagination and unapproved response schemas fail closed',async()=>{
  for(const value of [null,42,'a'.repeat(2049),'has space','bad\nline']) {
    await assert.rejects(()=>readOwnerIndexBaseline(async(_service,_method,path)=>({[path.includes('/indexes?')?'indexes':'fields']:[],nextPageToken:value})),/OTP owner index preflight/)
  }
  await assert.rejects(()=>readOwnerIndexBaseline(async(_service,_method,path)=>({[path.includes('/indexes?')?'indexes':'fields']:[],nextPageToken:'repeated'})),/repeated metadata page token/)
  let indexCalls=0
  await assert.rejects(()=>readOwnerIndexBaseline(async(_service,_method,path)=>{
    const kind=path.includes('/indexes?')?'indexes':'fields';return {[kind]:[],...(kind==='indexes'?{nextPageToken:'page_'+(++indexCalls)}:{})}
  }),/pagination limit exceeded/);assert.equal(indexCalls,10)
  await assert.rejects(()=>readOwnerIndexBaseline(async()=>({privateData:'not-approved'})),/unsupported metadata schema/)
  await assert.rejects(()=>readOwnerIndexBaseline(async(_service,_method,path)=>({[path.includes('/indexes?')?'indexes':'fields']:new Array(1001).fill({})})),/invalid metadata list/)
  for(const oversizedKind of ['indexes','fields']) {
    await assert.rejects(()=>readOwnerIndexBaseline(async(_service,_method,path)=>{
      const kind=path.includes('/indexes?')?'indexes':'fields'
      if(kind!==oversizedKind)return {[kind]:[]}
      const continuation=new URL('https://firestore.googleapis.com'+path).searchParams.get('pageToken')
      return continuation?{[kind]:[{}]}:{[kind]:new Array(1000).fill({}),nextPageToken:'overflow'}
    }),/pagination limit exceeded/)
  }
})
