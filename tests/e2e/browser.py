import os, json, io, re, time, traceback
from urllib.request import Request, urlopen
from urllib.parse import urlparse, parse_qs, urlencode
from pathlib import Path
from playwright.sync_api import sync_playwright, expect, TimeoutError as PlaywrightTimeout
from PIL import Image

PROJECT = 'demo-majstorsada-e2e'
assert os.environ.get('GCLOUD_PROJECT') == PROJECT
assert os.environ.get('FIRESTORE_EMULATOR_HOST') == '127.0.0.1:8180'
assert os.environ.get('FIREBASE_AUTH_EMULATOR_HOST') == '127.0.0.1:9199'
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
    # DOMContentLoaded can precede Vue hydration on a cold Vite start.
    # Filling SSR inputs before listeners attach can lose their values.
    page.wait_for_function('''() => {
        try { return window.useNuxtApp?.().isHydrating === false }
        catch { return false }
    }''', timeout=90000)
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

def retired_link_checks(context):
    # A valid, unused local Firebase email link must no longer sign in or send.
    # Fixture generation is local-only and is outside the browser request trace.
    auth_base = 'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/'
    legacy_email = 'retired-link@example.test'
    accounts = lambda: sorted(user['localId'] for user in http(auth_base + 'projects/' + PROJECT + '/accounts:batchGet?maxResults=1000').get('users', []))
    before = {'accounts': accounts(), 'clients': sorted(doc['name'] for doc in documents('clients')), 'outbox': len(documents('_otpTestOutbox'))}
    continuation = BASE + '/finishLogin?' + urlencode({'from':'/zahtev?tip=bravar'})
    http(auth_base + 'accounts:sendOobCode?key=demo-key', {
        'requestType':'EMAIL_SIGNIN', 'email':legacy_email,
        'continueUrl':continuation, 'canHandleCodeInApp':True,
    })
    codes = http('http://127.0.0.1:9199/emulator/v1/projects/' + PROJECT + '/oobCodes')['oobCodes']
    generated = urlparse(next(code for code in reversed(codes) if code['email'] == legacy_email)['oobLink'])
    assert generated.hostname in ('localhost', '127.0.0.1'), 'Retired-link fixture must remain local'
    query = parse_qs(generated.query)
    assert query.get('mode') == ['signIn'] and query.get('oobCode')
    legacy_context = context(); legacy = legacy_context.new_page()
    legacy.add_init_script("""if (location.origin === 'http://localhost:3333') {
      localStorage.setItem('emailForSignIn', 'retired-link@example.test');
      sessionStorage.setItem('postAuthRedirect', '/zahtev?tip=bravar');
    }""")
    writes = []
    def observe(request):
        parsed = urlparse(request.url)
        if re.search(r'accounts:(signInWithEmailLink|sendOobCode|signUp|update)$', parsed.path) or parsed.path.endswith(('/requestClientOtp', '/verifyClientOtp')):
            writes.append(parsed.path)
    legacy.on('request', observe)
    for ingress in ['/finishLogin', '/']:
        legacy.goto(BASE + ingress + '?' + generated.query, wait_until='domcontentloaded', timeout=180000)
        legacy.wait_for_url('**/login?from=**', timeout=90000)
        inspect(legacy, 'retired-link-' + ('finish' if ingress != '/' else 'root'))
        final_query = parse_qs(urlparse(legacy.url).query)
        assert urlparse(legacy.url).path == '/login'
        assert final_query == {'from':['/zahtev?tip=bravar']}, 'Only a safe request target may survive retirement'
        expect(legacy.locator('#client-otp-email')).to_be_visible()
        expect(legacy.get_by_role('button', name='Pošalji kod za prijavu', exact=False)).to_be_visible()
        assert legacy.evaluate("localStorage.getItem('emailForSignIn') === null && sessionStorage.getItem('postAuthRedirect') === null")
    assert not writes, 'Retired links must not consume, create identities, or send: ' + repr(writes)
    after = {'accounts': accounts(), 'clients': sorted(doc['name'] for doc in documents('clients')), 'outbox': len(documents('_otpTestOutbox'))}
    assert after == before, 'Retired ingress must leave identities, client profiles and OTP outbox unchanged'
    # The emulator still exposes the same unused code; the application never used it.
    remaining = http('http://127.0.0.1:9199/emulator/v1/projects/' + PROJECT + '/oobCodes')['oobCodes']
    assert any(code['email'] == legacy_email and parse_qs(urlparse(code['oobLink']).query).get('oobCode') == query['oobCode'] for code in remaining)
    legacy_context.close()
    print('PASS: valid retired links redirect safely from finish/root, clear legacy storage, and do not sign in, create profiles or send', flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel=os.environ.get('E2E_BROWSER_CHANNEL') or None)
    contexts = []
    errors = []
    def context():
        c = browser.new_context(service_workers='block')
        c.route('**/*', traffic)
        def observe_page(page):
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' and 'hydration' in message.text.lower() else None)
        c.on('page', observe_page)
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
        expect(switch).to_be_visible(timeout=90000)
        expect(switch).to_be_enabled()
        switch.click()
        expect(switch).to_have_attribute('aria-checked', 'true')
        expect(tp.get_by_text('Dostupan', exact=True)).to_be_visible()

        retired_link_checks(context)
        customer.goto(BASE + '/login', wait_until='domcontentloaded')
        inspect(customer, '04-client-login')
        expect(customer.locator('#client-otp-email')).to_be_visible()
        expect(customer.get_by_role('button', name='Pošalji kod za prijavu', exact=False)).to_be_visible()
        customer.locator('#client-otp-email').fill('klijent@example.test')
        customer.get_by_role('button', name='Pošalji kod za prijavu', exact=False).click()
        expect(customer.locator('#client-otp-code')).to_be_visible(timeout=90000)
        outbox = [doc for doc in documents('_otpTestOutbox') if doc['fields']['email']['stringValue'] == 'klijent@example.test']
        assert len(outbox) == 1, 'Client business fixture must send exactly one local OTP'
        otp_code = outbox[0]['fields']['code']['stringValue']
        assert len(otp_code) == 6 and otp_code.isdigit()
        customer.locator('#client-otp-code').fill(otp_code)
        customer.get_by_role('button', name='Potvrdi kod i nastavi', exact=False).click()
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
        inspect(tp, 'relogin-after-cross-tab-logout')
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
        # Cursor history: seven equal timestamps must paginate without omissions or duplicates.
        client_uid = documents('clients')[0]['name'].split('/')[-1]
        timestamp = __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat().replace('+00:00', 'Z')
        fixture_base = 'http://127.0.0.1:8180/v1/projects/' + PROJECT + '/databases/(default)/documents/'
        for index in range(7):
            http(fixture_base + 'jobs/pagination-job-' + str(index), {'fields': {
                'clientId': {'stringValue': client_uid}, 'acceptedByTradespersonId': {'stringValue': tp_uid},
                'status': {'stringValue': 'completed'}, 'problemDescription': {'stringValue': 'Istorija provera ' + str(index)},
                'specializationRequired': {'stringValue': 'vodoinstalater'}, 'createdAt': {'timestampValue': timestamp},
                'completedAt': {'timestampValue': timestamp}, 'rating': {'integerValue': '5'}
            }}, 'PATCH')
        customer.goto(BASE + '/klijent/dashboard', wait_until='domcontentloaded')
        inspect(customer, '15-history-first-page')
        expect(customer.get_by_text(re.compile('^Istorija provera [0-6]$'))).to_have_count(3)
        customer.get_by_role('button', name='Učitaj još', exact=True).first.click()
        expect(customer.get_by_text(re.compile('^Istorija provera [0-6]$'))).to_have_count(6)
        customer.get_by_role('button', name='Učitaj još', exact=True).first.click()
        expect(customer.get_by_text(re.compile('^Istorija provera [0-6]$'))).to_have_count(7)
        tp.get_by_role('tab', name='Istorija', exact=True).click()
        expect(tp.get_by_text(re.compile('^Istorija provera [0-6]$'))).to_have_count(3)
        tp.get_by_role('button', name='Učitaj još', exact=True).click()
        expect(tp.get_by_text(re.compile('^Istorija provera [0-6]$'))).to_have_count(6)
        tp.goto(BASE + '/majstor/recenzije', wait_until='domcontentloaded')
        inspect(tp, '16-reviews-first-page')
        expect(tp.get_by_text(re.compile('^Istorija provera [0-6]$'))).to_have_count(3)
        # A fully dismissed first live window must not hide the next window.
        from datetime import datetime, timezone, timedelta
        feed_expiry = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat().replace('+00:00', 'Z')
        for index in range(21):
            feed_fields = dict(fields)
            feed_fields.update({'status': {'stringValue': 'pending'}, 'imagesReady': {'booleanValue': True}, 'imagePaths': {'arrayValue': {'values': []}}, 'problemDescription': {'stringValue': 'Ponuda provera ' + str(index)}, 'expiresAt': {'timestampValue': feed_expiry}})
            http(fixture_base + 'jobs/feed-window-job-' + str(index).zfill(2), {'fields': feed_fields}, 'PATCH')
            if index > 0:
                http(fixture_base + 'tradespeople/' + tp_uid + '/dismissedJobs/feed-window-job-' + str(index).zfill(2), {'fields': {'expiresAt': {'timestampValue': feed_expiry}}}, 'PATCH')
        tp.goto(BASE + '/majstor/dashboard', wait_until='domcontentloaded')
        inspect(tp, '18-hidden-first-window')
        expect(tp.get_by_role('heading', name='Pregledajte još poslova', exact=True)).to_be_visible()
        expect(tp.get_by_text(re.compile('^Ponuda provera [0-9]+$'))).to_have_count(0)
        tp.get_by_role('button', name='Učitaj još', exact=True).click()
        expect(tp.get_by_text('Ponuda provera 0', exact=True)).to_be_visible()
        # Expiration must refresh via the timer without requiring a tab reload.
        near_expiry = (datetime.now(timezone.utc) + timedelta(seconds=3)).isoformat().replace('+00:00', 'Z')
        http(fixture_base + 'jobs/feed-window-job-00?updateMask.fieldPaths=expiresAt', {'fields': {'expiresAt': {'timestampValue': near_expiry}}}, 'PATCH')
        expect(tp.get_by_text('Ponuda provera 0', exact=True)).to_have_count(0, timeout=15000)
        for index in range(21):
            http(fixture_base + 'jobs/feed-window-job-' + str(index).zfill(2) + '?updateMask.fieldPaths=status', {'fields': {'status': {'stringValue': 'canceled'}}}, 'PATCH')
        print('PASS: fully dismissed first window, explicit next window, automatic expiry without page reload', flush=True)
        # Expired repeat is explicit and prefilled, without reviving the original job.
        expired_fields = dict(fields)
        expired_fields.update({'status': {'stringValue': 'expired'}, 'problemDescription': {'stringValue': 'Ponovi istekli zahtev'}, 'createdAt': {'timestampValue': timestamp}})
        http(fixture_base + 'jobs/repeat-expired-job1', {'fields': expired_fields}, 'PATCH')
        http(fixture_base + 'jobs/repeat-expired-job1/private/contact', {'fields': {'contactPhone': {'stringValue': '+381641234567'}}}, 'PATCH')
        customer.goto(BASE + '/klijent/dashboard', wait_until='domcontentloaded')
        inspect(customer, '17-expired-repeat')
        customer.get_by_role('link', name='I dalje mi treba majstor — pošalji ponovo', exact=True).click()
        expect(customer.locator('textarea')).to_have_value('Ponovi istekli zahtev')
        expect(customer.get_by_placeholder('06x xxx xxxx')).to_have_value('+381641234567')
        assert doc_fields('jobs/repeat-expired-job1')['status']['stringValue'] == 'expired'
        # Fill both daily slots on the server; UI must explain why a third new request is denied.
        http(fixture_base + 'clients/' + client_uid + '?updateMask.fieldPaths=recentJobCreations', {'fields': {'recentJobCreations': {'arrayValue': {'values': [{'timestampValue': timestamp}, {'timestampValue': timestamp}]}}}}, 'PATCH')
        customer.get_by_role('button', name='Pronađi Majstora', exact=True).click()
        expect(customer.get_by_text('Možete poslati najviše dva nova zahteva u poslednja 24 sata. Nastavak istog zahteva se ne računa ponovo.', exact=True)).to_be_visible(timeout=30000)
        print('PASS: history 3/6/7 with timestamp ties, tradesperson history, filtered reviews, explicit expired repeat and daily-limit UI', flush=True)
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
        print('PASS: registration recovery, real OTP login, retired-link rejection, lost create response, reload/photo recovery, authenticated photo, pre-accept privacy, zero-token guard, admin allocation, acceptance/contact, completion/rating, role-error recovery and logout', flush=True)
        if errors: raise AssertionError('Browser page errors: ' + repr(errors))
    except Exception:
        for index, c in enumerate(contexts):
            for i, page in enumerate(c.pages):
                try:
                    page.screenshot(path=str(ART / ('failure-' + str(index) + '-' + str(i) + '.png')), full_page=True)
                    print('FAILURE PAGE', page.url, page.locator('body').inner_text()[:6000], flush=True)
                except Exception: pass
        print('Browser page errors at failure:', repr(errors), flush=True)
        traceback.print_exc(); raise
    finally:
        browser.close()
