"""Compiled-app startup regression probe; every Auth/API response is synthetic.
Run against tests/build/ssr-server.mjs. Never connects to production data.
"""
import asyncio, base64, json, os, time
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:3344'
STAGE = os.environ.get('STARTUP_STAGE', 'after')

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
    errors, results = [], []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, channel=os.environ.get('E2E_BROWSER_CHANNEL', 'msedge'))
        async def new_context(storage=None, role_delay=0, sw_delay=0, role='client'):
            counts = {'role':0, 'lookup':0}
            context = await browser.new_context(service_workers='block', storage_state=storage)
            async def traffic(route):
                req, body = route.request, None
                url = urlsplit(req.url)
                if url.hostname == 'identitytoolkit.googleapis.com':
                    if url.path.endswith('accounts:signInWithPassword'):
                        body = {'localId':uid,'email':email,'idToken':token,'refreshToken':'fixture','expiresIn':'3600','registered':True}
                    elif url.path.endswith('accounts:lookup'):
                        counts['lookup'] += 1
                        body = {'users':[{'localId':uid,'email':email,'emailVerified':True,'providerUserInfo':[{'providerId':'password','federatedId':email,'email':email,'rawId':email}]}]}
                elif url.hostname == 'securetoken.googleapis.com':
                    body = {'access_token':token,'id_token':token,'refresh_token':'fixture','expires_in':'3600','token_type':'Bearer','user_id':uid,'project_id':'majstorsada-b2ad4'}
                elif url.hostname == 'europe-west3-majstorsada-b2ad4.cloudfunctions.net' and url.path == '/resolveAccount':
                    counts['role'] += 1
                    await asyncio.sleep(role_delay/1000)
                    body = {'role':role}
                if body is not None:
                    await route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':BASE}, body=json.dumps(body))
                elif url.hostname in ('127.0.0.1','localhost') and req.method == 'GET':
                    await route.continue_()
                else:
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
              const sample=()=>{
                if(!p.html && document.querySelector('h1')) p.html=performance.now();
                if(!p.mount && document.querySelector('#__nuxt')?.__vue_app__) p.mount=performance.now();
                if(!p.header && document.querySelector('header a[href="/klijent/dashboard"]')) p.header=performance.now();
                if(!p.mount || !p.header) setTimeout(sample,5);
              }; sample();
              }
            '''.replace('SW_DELAY',str(sw_delay)))
            context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
            return context, counts

        seed, _ = await new_context()
        page = await seed.new_page()
        await page.goto(BASE+'/majstor/login', wait_until='networkidle')
        assert await page.locator('form input').count() == 2
        await page.locator('input[type=email]').fill(email)
        await page.locator('input[type=password]').fill('FixturePassword1!')
        await page.locator('button[type=submit]').click()
        await page.wait_for_url('**/zahtev')
        storage = await seed.storage_state(indexed_db=True)
        await seed.close()

        for label, role_ms, sw_ms in [('normal',0,0), ('slow-notifications',0,2000), ('slow-role',1000,0), ('both-slow',1000,2000)]:
            for repeat in range(3):
                context, counts = await new_context(storage,role_ms,sw_ms)
                page = await context.new_page()
                await page.goto(BASE,wait_until='domcontentloaded')
                await page.locator('header a[href="/klijent/dashboard"]').wait_for()
                await page.wait_for_function('!!window.__startupProbe.header')
                probe = await page.evaluate('window.__startupProbe')
                assert counts['role']==1, (label,counts)
                assert probe['mount']>=probe['roleEnd'], 'Auth must still complete before app mount'
                if STAGE=='after' and sw_ms:
                    assert 'swEnd' not in probe, ('Header still waits for notifications',probe)
                    # Navigate before notification initialization completes; retain selected service.
                    await page.locator('nav[aria-label="Izaberite uslugu"] a[href="/vodoinstalater"]').click()
                    await page.wait_for_url('**/vodoinstalater')
                    await page.locator('a[href="/zahtev?tip=vodoinstalater"]').first.click()
                    await page.wait_for_url('**/zahtev?tip=vodoinstalater')
                    await page.locator('form').wait_for()
                    await page.wait_for_function("[...document.querySelectorAll('form button')].some(b => b.textContent.trim() === 'Vodoinstalater' && b.classList.contains('border-2'))")
                    assert counts['role']==1, 'Navigation duplicated the account lookup'
                results.append({'scenario':label,'repeat':repeat+1,**{k:round(v,1) for k,v in probe.items()},'calls':dict(counts)})
                await context.close()
        await browser.close()
    assert not errors, errors
    output={'stage':STAGE,'syntheticNetwork':True,'runs':results,'pageErrors':errors}
    Path('.firebase/startup').mkdir(parents=True,exist_ok=True)
    Path('.firebase/startup/'+STAGE+'.json').write_text(json.dumps(output,indent=2),encoding='utf8')
    for label in dict.fromkeys(row['scenario'] for row in results):
        rows=[r for r in results if r['scenario']==label]
        print(json.dumps({'stage':STAGE,'scenario':label,'headerMs':[r['header'] for r in rows],'postRoleMs':[round(r['header']-r['roleEnd'],1) for r in rows]}),flush=True)

asyncio.run(main())
