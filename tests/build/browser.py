from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError
from urllib.parse import urlparse
import json, os, time, xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright
from seo import SEO

BASE='http://127.0.0.1:3344'
expected=json.loads(Path('tests/build/seo-baseline.json').read_text(encoding='utf8'))
results=[]
def validate_graph(parser):
    nodes={n['@id']:n for n in parser.graphs if '@id' in n}
    def walk(value):
        if isinstance(value,dict):
            if set(value)=={'@id'} and value['@id'].startswith('https://majstorsada.rs/') and '#' in value['@id']:
                assert value['@id'] in nodes, ('Unresolved schema reference',value['@id'])
            for child in value.values(): walk(child)
        elif isinstance(value,list):
            for child in value: walk(child)
    walk(parser.graphs)
    for node in parser.graphs:
        if node.get('@type')=='Service':
            provider=nodes[node['provider']['@id']]
            assert provider['@type']=='Organization' and provider['name']=='MajstorSada'

for route, baseline in expected.items():
    artifact=Path('.output/public')/route.lstrip('/')/'index.html'
    parser=SEO(); parser.feed(artifact.read_text(encoding='utf8'))
    validate_graph(parser)
    assert parser.summary()==baseline, (route, parser.summary(), baseline)
    started=time.perf_counter()
    with urlopen(BASE+route,timeout=30) as response:
        assert response.status==200; rendered=response.read().decode()
    results.append({'route':route,'ssrMs':round((time.perf_counter()-started)*1000)})
    parser=SEO(); parser.feed(rendered)
    validate_graph(parser)
    assert parser.summary()==baseline, ('SSR',route,parser.summary(),baseline)
ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
urls={n.text for n in ET.parse('.output/public/sitemap.xml').findall('s:url/s:loc',ns)}
assert urls=={v['canonical'] for v in expected.values()}, urls
robots=Path('.output/public/robots.txt').read_text(encoding='utf8')
for path in ['/admin','/majstor','/klijent','/login','/finishLogin']:
    assert 'Disallow: '+path in robots
assert 'https://majstorsada.rs/sitemap.xml' in robots
private_routes=['/login','/finishLogin','/account','/zahtev','/potvrda','/majstor/dashboard','/admin/majstor/test','/%61dmin/majstor/test','/admin/%6dajstor/test','/majstor/register','/majstor/login','/admin/login']
for route in private_routes:
    with urlopen(BASE+route,timeout=30) as response:
        body=response.read().decode(); parser=SEO(); parser.feed(body)
        assert 'noindex' in (response.headers.get('X-Robots-Tag','')+str(parser.result['robots'])), route
        assert 'Učitavanje naloga…' in body, ('Private SSR must use the stable account shell', route)
# Nuxt 4.5 deliberately installs a no-op island handler when islands are disabled.
with urlopen(BASE+'/__nuxt_island/unknown.json',timeout=30) as response:
    assert response.status==204 and response.read()==b'', 'Island rendering must remain disabled'
for route in ['/does-not-exist-phase3']:
    try: urlopen(BASE+route,timeout=30); raise AssertionError('Unexpected exposed route '+route)
    except HTTPError as e: assert e.code==404, (route,e.code)
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel=os.environ.get('E2E_BROWSER_CHANNEL') or None)
    context=browser.new_context(service_workers='block')
    context.route('**/*',lambda route: route.continue_() if urlparse(route.request.url).hostname in ('127.0.0.1','localhost') else route.abort())
    page=context.new_page(); page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'hydration' in m.text.lower() else None)
    for route in expected:
        page.goto(BASE+route,wait_until='networkidle')
        page.wait_for_function('''() => {
            try { return window.useNuxtApp?.().isHydrating === false }
            catch { return false }
        }''', timeout=30000)
        assert page.locator('h1').inner_text().strip()==expected[route]['h1']
        assert page.title()==expected[route]['title']
    page.set_viewport_size({'width':390,'height':844})
    page.goto(BASE,wait_until='networkidle')
    assert page.locator('body').evaluate('(e)=>e.scrollWidth<=window.innerWidth+1')
    Path('.firebase/phase3').mkdir(parents=True,exist_ok=True)
    page.screenshot(path='.firebase/phase3/public-mobile.png',full_page=True)
    browser.close()
assert not errors, errors
print(json.dumps({'publicRoutes':len(expected),'seo':'public metadata preserved; schema references verified','privateNoindex':len(private_routes),'browserErrors':errors,'timings':results},ensure_ascii=False))
