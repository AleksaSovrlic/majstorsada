import os, json, io, re, time, traceback
from urllib.request import Request, urlopen
from urllib.parse import urlparse, parse_qs, urlencode
from pathlib import Path
from playwright.sync_api import sync_playwright, expect, TimeoutError as PlaywrightTimeout
from PIL import Image

PROJECT = 'demo-majstorsada-e2e'
assert os.environ.get('GCLOUD_PROJECT') == PROJECT
assert os.environ.get('FIRESTORE_EMULATOR_HOST') == '127.0.0.1:8180'
BASE = 'http://localhost:3333'
ART = Path('.firebase/e2e'); ART.mkdir(parents=True, exist_ok=True)
def http(url, data=None, method=None):
    assert urlparse(url).hostname in ('localhost', '127.0.0.1')
    req = Request(url, data=json.dumps(data).encode() if data is not None else None, headers={'Content-Type':'application/json', 'Authorization':'Bearer owner'}, method=method)
    with urlopen(req, timeout=30) as response: return json.load(response)
def documents(collection):
    return http('http://127.0.0.1:8180/v1/projects/' + PROJECT + '/databases/(default)/documents/' + collection).get('documents', [])
def doc_fields(path):
    return http('http://127.0.0.1:8180/v1/projects/' + PROJECT + '/databases/(default)/documents/' + path)['fields']
def inspect(page, name):
    try:
        page.wait_for_load_state('networkidle', timeout=5000)
    except PlaywrightTimeout:
        # Firestore keeps a streaming channel open. Read rendered state after
        # DOM readiness and use explicit assertions for each subsequent action.
        page.wait_for_load_state('domcontentloaded')
    print(name, page.url, page.locator('body').inner_text()[:2500], flush=True)
    print('fields', page.locator('input, textarea, select').evaluate_all('(els) => els.map(e => ({tag:e.tagName, type:e.type, placeholder:e.placeholder, disabled:e.disabled}))'), flush=True)
    page.screenshot(path=str(ART / (name + '.png')), full_page=True)
def register_form(page):
    page.get_by_placeholder('Pera Perić').fill('E2E Majstor')
    page.get_by_placeholder('06x xxx xxxx').fill('0641234567')
    page.locator('select').first.select_option('vodoinstalater')
def traffic(route):
    url = route.request.url
    if urlparse(url).hostname == 'api.mapbox.com':
        route.fulfill(json={'features':[{'id':'address.test','text':'Test','place_name':'Test adresa 1, Beograd','center':[20.46,44.8],'context':[{'id':'place.beograd','text':'Beograd'}]}]})
    elif urlparse(url).hostname in ('localhost','127.0.0.1') or url.startswith(('blob:','data:')):
        route.continue_()
    else:
        route.abort()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel=os.environ.get('E2E_BROWSER_CHANNEL') or None)
    contexts = []
    errors = []
    def context():
        c = browser.new_context(service_workers='block')
        c.route('**/*', traffic)
        c.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
        contexts.append(c); return c
    tp_context = context(); tp = tp_context.new_page()
    client_context = context(); customer = client_context.new_page()
    try:
        tp.goto(BASE + '/majstor/register', wait_until='domcontentloaded', timeout=180000)
        inspect(tp, '01-registration')
        register_form(tp)
        tp.get_by_placeholder('vasa.adresa@primer.com').fill('majstor@example.test')
        tp.get_by_placeholder('min 8 karaktera').fill('TestPassword123!')
        # Simulate a connection loss AFTER Firebase Auth creates the account.
        def fail_registration(route):
            route.fulfill(status=503, json={'error':'Test prekida veze'})
        tp.route('**/completeRegistration', fail_registration)
        tp.get_by_role('button', name='Registruj se', exact=True).click()
        expect(tp.get_by_text('Test prekida veze', exact=True)).to_be_visible(timeout=90000)
        tp.unroute('**/completeRegistration', fail_registration)
        tp.reload(wait_until='domcontentloaded')
        inspect(tp, '02-registration-recovery')
        expect(tp.get_by_placeholder('min 8 karaktera')).to_have_count(0)
        expect(tp.get_by_placeholder('vasa.adresa@primer.com')).to_have_value('majstor@example.test')
        register_form(tp)
        tp.get_by_role('button', name='Dovrši registraciju', exact=True).click()
        tp.wait_for_url('**/majstor/dashboard', timeout=90000)
        inspect(tp, '03-tradesperson-dashboard')
        profiles = documents('tradespeople')
        assert len(profiles) == 1
        tp_uid = profiles[0]['name'].split('/')[-1]
        assert profiles[0]['fields']['balanceTokens']['integerValue'] == '0'
        # Availability uses the real UI/rules, no token balance is required.
        print('dashboard buttons', tp.get_by_role('button').all_text_contents(), flush=True)
        switch = tp.get_by_role('switch')
        if switch.count(): switch.click()
        else: tp.get_by_text('Nedostupan', exact=True).click()

        customer.goto(BASE + '/login', wait_until='domcontentloaded')
        inspect(customer, '04-client-login')
        customer.locator('input[type=email]').fill('klijent@example.test')
        customer.locator('button[type=submit]').click()
        expect(customer.get_by_text('Proverite', exact=False).first).to_be_visible(timeout=30000)
        codes = http('http://127.0.0.1:9199/emulator/v1/projects/' + PROJECT + '/oobCodes')['oobCodes']
        code = next(c for c in reversed(codes) if c['email'] == 'klijent@example.test')
        code_value = code.get('oobCode') or parse_qs(urlparse(code['oobLink']).query)['oobCode'][0]
        customer.goto(BASE + '/finishLogin?' + urlencode({'mode':'signIn','oobCode':code_value,'apiKey':'demo-key','from':'/zahtev'}), wait_until='domcontentloaded')
        customer.wait_for_url('**/zahtev', timeout=90000)
        inspect(customer, '05-request')
        customer.get_by_role('button', name='Vodoinstalater', exact=True).click()
        customer.locator('textarea').fill('E2E curi slavina')
        customer.get_by_placeholder('Počnite da kucate i izaberite iz liste').fill('Test adresa')
        customer.get_by_text('Test adresa 1, Beograd', exact=True).click()
        customer.get_by_placeholder('06x xxx xxxx').fill('0641234567')
        image = Image.new('RGB', (40,40), color=(30,130,230)); buffer = io.BytesIO(); image.save(buffer, format='JPEG')
        customer.locator('input[type=file]').set_input_files({'name':'test.jpg','mimeType':'image/jpeg','buffer':buffer.getvalue()})
        # Commit succeeds, response is lost: recovery must find the same opaque ID.
        def lose_response(route):
            route.fetch(timeout=90000)
            route.abort()
        customer.route('**/createJob', lose_response, times=1)
        customer.get_by_role('button', name='Pronađi Majstora', exact=True).click()
        expect(customer.get_by_role('button', name='Dovrši slanje zahteva', exact=True)).to_be_visible(timeout=90000)
        customer.reload(wait_until='domcontentloaded')
        inspect(customer, '06-request-recovery')
        expect(customer.locator('textarea')).to_have_value('E2E curi slavina')
        customer.locator('input[type=file]').set_input_files({'name':'test.jpg','mimeType':'image/jpeg','buffer':buffer.getvalue()})
        customer.get_by_role('button', name='Dovrši slanje zahteva', exact=True).click()
        customer.wait_for_url('**/potvrda', timeout=90000)
        jobs = documents('jobs'); assert len(jobs) == 1
        job_id = jobs[0]['name'].split('/')[-1]; fields = jobs[0]['fields']
        assert fields['imagesReady']['booleanValue'] is True
        assert 'contactPhone' not in fields and 'clientEmail' not in fields
        inspect(tp, '07-feed-before-acceptance')
        expect(tp.get_by_text('E2E curi slavina', exact=True)).to_be_visible(timeout=30000)
        expect(tp.locator('img[alt="Slika kvara"]')).to_be_visible(timeout=90000)
        assert '+381641234567' not in tp.locator('body').inner_text()
        assert 'klijent@example.test' not in tp.locator('body').inner_text()
        tp.get_by_role('button', name='Prihvati', exact=True).click()
        expect(tp.get_by_text('Nemate dovoljno žetona za ovaj posao.', exact=True)).to_be_visible(timeout=30000)
        # Only admin membership is seeded; allocation runs through the real admin UI/API.
        admin_identity = http('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {'email':'admin@example.test','password':'TestPassword123!','returnSecureToken':True})
        admin_uid = admin_identity['localId']
        http('http://127.0.0.1:8180/v1/projects/' + PROJECT + '/databases/(default)/documents/admins/' + admin_uid, {'fields':{'uid':{'stringValue':admin_uid}}}, 'PATCH')
        admin_context = context(); admin = admin_context.new_page()
        admin.goto(BASE + '/admin/login', wait_until='domcontentloaded')
        inspect(admin, '08-admin-login')
        admin.locator('input[type=email]').fill('admin@example.test')
        admin.locator('input[type=password]').fill('TestPassword123!')
        admin.locator('button[type=submit]').click()
        admin.wait_for_url('**/admin/dashboard', timeout=90000)
        admin.goto(BASE + '/admin/majstor/' + tp_uid, wait_until='domcontentloaded')
        inspect(admin, '09-admin-allocation')
        admin.locator('input[type=number]').fill('1')
        with admin.expect_response('**/updateTokensByAdmin', timeout=90000) as allocation:
            admin.get_by_role('button', name='Dodaj Žetone', exact=True).click()
        assert allocation.value.status == 200
        tp.get_by_role('button', name='Prihvati', exact=True).click()
        tp.get_by_role('tab', name=re.compile('Aktivni')).click()
        expect(tp.locator('a[href="tel:+381641234567"]')).to_be_visible(timeout=30000)
        assert doc_fields('tradespeople/' + tp_uid)['balanceTokens']['integerValue'] == '0'
        inspect(tp, '10-accepted-contact')
        expect(admin.locator('a[href="tel:+381641234567"]')).to_be_visible(timeout=30000)
        # Cross-tab logout clears an already rendered private phone and its listeners.
        second_tp_tab = tp_context.new_page()
        second_tp_tab.goto(BASE + '/majstor/dashboard', wait_until='domcontentloaded')
        inspect(second_tp_tab, '13-second-tradesperson-tab')
        second_tp_tab.get_by_role('button', name='Odjava', exact=True).click()
        tp.wait_for_url('**/majstor/login', timeout=30000)
        expect(tp.locator('a[href="tel:+381641234567"]')).to_have_count(0)
        tp.locator('input[type=email]').fill('majstor@example.test')
        tp.locator('input[type=password]').fill('TestPassword123!')
        tp.locator('button[type=submit]').click()
        tp.wait_for_url('**/majstor/dashboard', timeout=90000)
        tp.get_by_role('tab', name=re.compile('Aktivni')).click()
        expect(tp.locator('a[href="tel:+381641234567"]')).to_be_visible(timeout=30000)
        tp.get_by_role('button', name='Završi posao', exact=True).click()
        expect(tp.get_by_text('Posao je označen kao završen.', exact=True)).to_be_visible(timeout=30000)
        customer.goto(BASE + '/klijent/dashboard', wait_until='domcontentloaded')
        inspect(customer, '11-client-rating')
        customer.get_by_role('button', name='Oceni', exact=True).click()
        customer.get_by_role('button', name='Ocena zvezdicom', exact=True).nth(4).click()
        with customer.expect_response('**/submitJobRating', timeout=90000) as rating:
            customer.get_by_role('button', name='Pošalji', exact=True).click()
        assert rating.value.status == 200
        assert doc_fields('tradespeople/' + tp_uid)['ratingCount']['integerValue'] == '1'
        # Cross-role routes redirect to the actual role, never auto-create profiles.
        customer.goto(BASE + '/majstor/dashboard', wait_until='domcontentloaded')
        customer.wait_for_url('**/zahtev', timeout=30000)
        tp.goto(BASE + '/zahtev', wait_until='domcontentloaded')
        tp.wait_for_url('**/majstor/dashboard', timeout=30000)
        # A role lookup outage must not turn this user into a client.
        def fail_role(route): route.fulfill(status=503, json={'error':'Test nedostupne provere naloga'})
        tp.route('**/resolveAccount', fail_role)
        tp.reload(wait_until='domcontentloaded')
        tp.wait_for_url('**/account', timeout=30000)
        inspect(tp, '12-role-error-recovery')
        expect(tp.get_by_text('Test nedostupne provere naloga', exact=True)).to_be_visible(timeout=30000)
        tp.unroute('**/resolveAccount', fail_role)
        tp.get_by_role('button', name='Pokušaj ponovo', exact=True).click()
        tp.wait_for_url('**/majstor/dashboard', timeout=90000)
        tp.get_by_role('button', name='Odjava', exact=True).click()
        tp.wait_for_url('**/majstor/login', timeout=30000)
        expect(tp.locator('a[href="tel:+381641234567"]')).to_have_count(0)
        # A client request form must also clear private data on logout from another tab.
        customer.get_by_placeholder('06x xxx xxxx').fill('0641111111')
        customer.locator('textarea').fill('Local draft cleared on logout')
        second_client_tab = client_context.new_page()
        second_client_tab.goto(BASE + '/klijent/dashboard', wait_until='domcontentloaded')
        inspect(second_client_tab, '14-second-client-tab')
        second_client_tab.get_by_role('button', name='Odjava', exact=True).click()
        customer.wait_for_url('**/login', timeout=30000)
        expect(customer.locator('textarea')).to_have_count(0)
        expect(customer.locator('input[type=tel]')).to_have_count(0)
        assert len(documents('clients')) == 1
        assert len(documents('tradespeople')) == 1
        print('PASS: registration recovery, real magic link, lost create response, reload/photo recovery, authenticated photo, pre-accept privacy, zero-token guard, admin allocation, acceptance/contact, completion/rating, role-error recovery and logout', flush=True)
        if errors: raise AssertionError('Browser page errors: ' + repr(errors))
    except Exception:
        for index, c in enumerate(contexts):
            for i, page in enumerate(c.pages):
                try:
                    page.screenshot(path=str(ART / ('failure-' + str(index) + '-' + str(i) + '.png')), full_page=True)
                    print('FAILURE PAGE', page.url, page.locator('body').inner_text()[:6000], flush=True)
                except Exception: pass
        traceback.print_exc(); raise
    finally:
        browser.close()
