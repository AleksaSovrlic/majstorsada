"""Compiled startup regression. Production-shaped SDK, entirely synthetic Auth/API.
Only GET http://127.0.0.1:3344 reaches a server. Never calls real Auth, APIs or data.
STARTUP_STAGE=before measures an older build without optimization-only assertions.
"""
import asyncio, base64, json, os, re, statistics, time
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:3344'
STAGE = os.environ.get('STARTUP_STAGE', 'after')
assert re.fullmatch(r'[A-Za-z0-9_-]+', STAGE), 'Use a simple stage name'
OUT = Path('.firebase/startup')
OUT.mkdir(parents=True, exist_ok=True)
EXPECTED = json.loads(Path('.output/public/_nuxt/builds/latest.json').read_text())['id']
# Both stable error keys come from the installed @firebase/messaging SDK. Require
# exactly one matching output chunk, so a dependency/build change fails explicitly.
SDK_MARKERS = ('failed-service-worker-registration', 'token-subscribe-failed')
SDK_CHUNK = None
if STAGE != 'before':
    matches = [p.name for p in Path('.output/public/_nuxt').glob('*.js')
               if all(marker in p.read_text(encoding='utf8') for marker in SDK_MARKERS)]
    assert len(matches) == 1, ('Expected one Firebase Messaging chunk; inspect build output', matches)
    SDK_CHUNK = matches[0]


def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')


async def main():
    stamp = int(time.time())
    uid, email = 'startup-fixture', 'startup@example.invalid'
    token = encode({'alg':'RS256','typ':'JWT'}) + '.' + encode({
        'iss':'https://securetoken.google.com/majstorsada-b2ad4', 'aud':'majstorsada-b2ad4',
        'sub':uid, 'user_id':uid, 'email':email, 'email_verified':True,
        'iat':stamp, 'exp':stamp+3600, 'auth_time':stamp,
        'firebase':{'identities':{'email':[email]}, 'sign_in_provider':'password'}
    }) + '.fixture'
    errors, results, unexpected = [], [], []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, channel=os.environ.get('E2E_BROWSER_CHANNEL', 'msedge'))

        async def new_context(storage=None, role_delay=0, sw_delay=0, sdk_delay=0, role='client'):
            counts = {'role':0, 'lookup':0, 'seedSignIn':0, 'refresh':0, 'localGet':0, 'sdkHeld':0, 'sdkReleased':0, 'sdkRequests':[]}
            context = await browser.new_context(service_workers='block', storage_state=storage)
            sdk_started = asyncio.Event()

            async def traffic(route):
                req, body = route.request, None
                url = urlsplit(req.url)
                if req.method == 'POST' and url.hostname == 'identitytoolkit.googleapis.com':
                    if url.path.endswith('accounts:signInWithPassword'):
                        counts['seedSignIn'] += 1
                        body = {'localId':uid,'email':email,'idToken':token,'refreshToken':'fixture','expiresIn':'3600','registered':True}
                    elif url.path.endswith('accounts:lookup'):
                        counts['lookup'] += 1
                        body = {'users':[{'localId':uid,'email':email,'emailVerified':True,'providerUserInfo':[{'providerId':'password','federatedId':email,'email':email,'rawId':email}]}]}
                elif req.method == 'POST' and url.hostname == 'securetoken.googleapis.com':
                    counts['refresh'] += 1
                    body = {'access_token':token,'id_token':token,'refresh_token':'fixture','expires_in':'3600','token_type':'Bearer','user_id':uid,'project_id':'majstorsada-b2ad4'}
                elif req.method == 'POST' and url.hostname == 'europe-west3-majstorsada-b2ad4.cloudfunctions.net' and url.path == '/resolveAccount':
                    counts['role'] += 1
                    await asyncio.sleep(role_delay/1000)
                    body = {'role':role}
                if body is not None:
                    await route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':BASE}, body=json.dumps(body))
                elif url.scheme == 'http' and url.hostname == '127.0.0.1' and url.port == 3344 and req.method == 'GET':
                    counts['localGet'] += 1
                    if sdk_delay and SDK_CHUNK and url.path.endswith('/' + SDK_CHUNK):
                        counts['sdkHeld'] += 1
                        # Nuxt can issue a passive SSR prefetch plus the actual module
                        # import; routing disables HTTP cache, so hold every matching fetch.
                        headers = req.headers
                        counts['sdkRequests'].append({'resourceType':req.resource_type,
                            'secPurpose':headers.get('sec-purpose'), 'purpose':headers.get('purpose')})
                        sdk_started.set()
                        try:
                            await asyncio.sleep(sdk_delay/1000)
                            counts['sdkReleased'] += 1
                            await route.continue_()
                        except Exception:
                            # Context may close after the deliberate pending-chunk assertion.
                            pass
                    else:
                        await route.continue_()
                else:
                    # Never record body or credentials; unexpected endpoints fail the run.
                    unexpected.append({'method':req.method,'host':url.hostname,'path':url.path})
                    await route.abort()

            await context.route('**/*', traffic)
            await context.add_init_script('''
              if (location.origin === 'http://127.0.0.1:3344') {
                window.__startupProbe={};
                const p=window.__startupProbe, originalFetch=window.fetch;
                window.fetch=async function(...args) {
                  const url=String(args[0]);
                  const key=url.includes('accounts:lookup')?'lookup':url.endsWith('/resolveAccount')?'role':null;
                  if(key) p[key+'Start']=performance.now();
                  try {return await originalFetch.apply(this,args)}
                  finally {if(key) p[key+'End']=performance.now()}
                };
                navigator.serviceWorker.register=async function() {
                  p.swStart=performance.now();
                  await new Promise(resolve=>setTimeout(resolve, SW_DELAY));
                  p.swEnd=performance.now();
                  throw new Error('Controlled offline service worker fixture');
                };
                document.addEventListener('DOMContentLoaded',()=>p.domContentLoaded=performance.now(),{once:true});
                const sample=()=>{
                  if(!p.html && document.querySelector('h1')) p.html=performance.now();
                  if(!p.mount && document.querySelector('#__nuxt')?.__vue_app__) p.mount=performance.now();
                  try {if(!p.hydrationComplete && window.useNuxtApp?.().isHydrating===false) p.hydrationComplete=performance.now()} catch {}
                  if(!p.header && document.querySelector('header a[href="HEADER_HREF"]')) p.header=performance.now();
                  if(!p.mount || !p.header || !p.hydrationComplete) setTimeout(sample,5);
                }; sample();
              }
            '''.replace('SW_DELAY',str(sw_delay)).replace('HEADER_HREF','/majstor/dashboard' if role=='tradesperson' else '/klijent/dashboard'))
            context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
            return context, counts, sdk_started

        seed, seed_counts, _ = await new_context()
        page = await seed.new_page()
        await page.goto(BASE+'/majstor/login', wait_until='networkidle')
        assert await page.locator('form input').count() == 2
        await page.locator('input[type=email]').fill(email)
        await page.locator('input[type=password]').fill('FixturePassword1!')
        await page.locator('button[type=submit]').click()
        await page.wait_for_url('**/zahtev')
        storage = await seed.storage_state(indexed_db=True)
        assert seed_counts['seedSignIn'] == 1, seed_counts
        await seed.close()

        scenarios=[('normal',0,0,0), ('slow-notifications',0,2000,0), ('slow-role',1000,0,0), ('both-slow',1000,2000,0)]
        if SDK_CHUNK:
            scenarios.append(('slow-sdk',0,0,2000))
        for role in ['client','tradesperson']:
            for label, role_ms, sw_ms, sdk_ms in scenarios:
                for repeat in range(3):
                    context, counts, sdk_started = await new_context(storage,role_delay=role_ms,sw_delay=sw_ms,sdk_delay=sdk_ms,role=role)
                    page = await context.new_page()
                    await page.goto(BASE,wait_until='domcontentloaded')
                    href='/majstor/dashboard' if role=='tradesperson' else '/klijent/dashboard'
                    await page.locator('header a[href="'+href+'"]').wait_for()
                    await page.wait_for_function('!!window.__startupProbe.header && !!window.__startupProbe.hydrationComplete')
                    probe = await page.evaluate('window.__startupProbe')
                    runtime_id=await page.evaluate('window.useNuxtApp().$config.app.buildId')
                    assert runtime_id == EXPECTED, (runtime_id,EXPECTED)
                    navigation=await page.evaluate('''(()=>{const n=performance.getEntriesByType('navigation')[0];return {responseStart:n.responseStart,responseEnd:n.responseEnd,domInteractive:n.domInteractive,domContentLoadedEventEnd:n.domContentLoadedEventEnd}})()''')
                    resources=await page.evaluate('''performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname.endsWith('.js')).map(r=>({path:new URL(r.name).pathname,initiator:r.initiatorType,start:r.startTime,end:r.responseEnd,duration:r.duration,transfer:r.transferSize,encoded:r.encodedBodySize,decoded:r.decodedBodySize}))''')
                    assert counts['role'] == 1 and counts['lookup'] == 1 and counts['seedSignIn'] == 0, (label,counts)
                    assert probe['mount'] >= probe['roleEnd'], 'Auth/role must still complete before app mount'
                    if role_ms:
                        assert probe['roleEnd']-probe['roleStart'] >= role_ms-20, probe
                    if STAGE != 'before' and sw_ms:
                        # Lazy SDK loading can finish after the header; observe worker start
                        # separately before asserting that its deliberately held setup is pending.
                        await page.wait_for_function("typeof window.__startupProbe.swStart === 'number'")
                        probe = await page.evaluate('window.__startupProbe')
                        assert 'swEnd' not in probe, ('Header waited for service worker setup',probe)
                        assert probe['header'] < probe['swStart']+sw_ms, probe
                    if sdk_ms:
                        await asyncio.wait_for(sdk_started.wait(), timeout=5)
                        assert counts['sdkHeld'] >= 1, ('Lazy SDK request was not held',counts)
                        assert counts['sdkReleased'] == 0, ('Header waited for the lazy SDK',probe,counts)
                    if repeat == 0:
                        await page.screenshot(path=str(OUT/(STAGE+'-'+role+'-'+label+'.png')), full_page=False)
                    if STAGE != 'before' and sw_ms and role == 'client':
                        # Navigate while push initialization is deliberately pending.
                        await page.locator('nav[aria-label="Izaberite uslugu"] a[href="/vodoinstalater"]').click()
                        await page.wait_for_url('**/vodoinstalater')
                        await page.locator('a[href="/zahtev?tip=vodoinstalater"]').first.click()
                        await page.wait_for_url('**/zahtev?tip=vodoinstalater')
                        await page.locator('form').wait_for()
                        await page.wait_for_function("[...document.querySelectorAll('form button')].some(b => b.textContent.trim() === 'Vodoinstalater' && b.classList.contains('border-2'))")
                        assert counts['role'] == 1 and counts['lookup'] == 1, 'Navigation duplicated account verification'
                    result={'role':role,'scenario':label,'repeat':repeat+1,'runtimeBuildId':runtime_id,
                        **{k:round(v,1) for k,v in probe.items()},'navigation':{k:round(v,1) for k,v in navigation.items()},
                        'headerHref':href,'calls':dict(counts),'scriptResources':resources,
                        'scriptsRequestedBeforeLookup':[r['path'] for r in resources if r['start'] < probe['lookupStart']],
                        'scriptsRequestedAfterRole':[r['path'] for r in resources if r['start'] >= probe['roleEnd']]}
                    results.append(result)
                    (OUT/(STAGE+'-partial.json')).write_text(json.dumps({'stage':STAGE,'runs':results,'pageErrors':errors,'blockedRequests':unexpected},indent=2),encoding='utf8')
                    print(json.dumps({'stage':STAGE,'role':role,'scenario':label,'repeat':repeat+1,'headerMs':result['header'],'lookupStartMs':result['lookupStart'],'postRoleMs':round(result['header']-result['roleEnd'],1),'lookupMs':round(result['lookupEnd']-result['lookupStart'],1),'roleMs':round(result['roleEnd']-result['roleStart'],1)}),flush=True)
                    await context.close()
        await browser.close()
    assert not errors, errors
    # Analytics are intentionally blocked as well; nothing external reaches the network.
    assert all(r['method']=='GET' and r['host']=='static.cloudflareinsights.com' and r['path'].startswith('/beacon.min.js/') for r in unexpected), unexpected
    output={'stage':STAGE,'localCompiledFrontend':True,'expectedBuild':EXPECTED,'syntheticAuthAndApi':True,
        'messagingChunk':SDK_CHUNK,'realNetwork':'GET http://127.0.0.1:3344 only','runs':results,'pageErrors':errors,'blockedRequests':unexpected,'seedCounts':seed_counts}
    summaries=[]
    for role in ['client','tradesperson']:
        for label, role_ms, sw_ms, sdk_ms in scenarios:
            rows=[r for r in results if r['role']==role and r['scenario']==label]
            summaries.append({'role':role,'scenario':label,'injectedRoleMs':role_ms,'injectedNotificationMs':sw_ms,'injectedSdkMs':sdk_ms,
                'headerMs':[r['header'] for r in rows], 'medianHeaderMs':round(statistics.median(r['header'] for r in rows),1),
                'medianLookupStartMs':round(statistics.median(r['lookupStart'] for r in rows),1),
                'postRoleMs':[round(r['header']-r['roleEnd'],1) for r in rows],
                'medianPostRoleMs':round(statistics.median(r['header']-r['roleEnd'] for r in rows),1)})
    output['summary']=summaries
    (OUT/(STAGE+'.json')).write_text(json.dumps(output,indent=2),encoding='utf8')
    print(json.dumps({'passed':True,'stage':STAGE,'runs':len(results),'pageErrors':errors,'blockedRequests':unexpected,'summary':summaries}),flush=True)

asyncio.run(main())
