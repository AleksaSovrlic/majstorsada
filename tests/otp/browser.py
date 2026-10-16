"""OTP browser tests against local emulators; never sends mail to AWS.
The private test outbox is read by the test process, never by application UI.
"""
import os, json
from urllib.request import Request, urlopen
from urllib.parse import urlparse
from pathlib import Path
from playwright.sync_api import sync_playwright, expect, TimeoutError as PlaywrightTimeout

PROJECT = 'demo-majstorsada-e2e'
assert os.environ.get('GCLOUD_PROJECT') == PROJECT
assert os.environ.get('FIRESTORE_EMULATOR_HOST') == '127.0.0.1:8180'
assert os.environ.get('FIREBASE_AUTH_EMULATOR_HOST') == '127.0.0.1:9199'
BASE = 'http://localhost:3333'
ART = Path('.firebase/otp/browser'); ART.mkdir(parents=True, exist_ok=True)

def docs(collection):
    url = f'http://127.0.0.1:8180/v1/projects/{PROJECT}/databases/(default)/documents/{collection}'
    with urlopen(Request(url, headers={'Authorization':'Bearer owner'}), timeout=30) as response:
        return json.load(response).get('documents', [])

def outbox(email):
    return [d for d in docs('_otpTestOutbox') if d['fields']['email']['stringValue'] == email]

def code_for(email):
    records = outbox(email)
    assert len(records) == 1, 'Every test sends precisely one email to its own unique address'
    value = records[0]['fields']['code']['stringValue']
    assert len(value) == 6 and value.isdigit()
    return value

def ready(page):
    page.wait_for_function("""() => { try { return window.useNuxtApp?.().isHydrating === false } catch { return false } }""", timeout=90000)

def begin(page, email):
    page.goto(BASE + '/login?from=%2Fzahtev%3Ftip%3Dbravar', wait_until='domcontentloaded', timeout=180000)
    ready(page)
    page.get_by_label('E-mail', exact=True).fill(email)
    page.get_by_role('button', name='Pošalji kod za prijavu', exact=False).click()

def paste(page, code):
    field = page.get_by_label('Šestocifreni kod', exact=True)
    field.evaluate("""(element, value) => { const data = new DataTransfer(); data.setData('text', value); element.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true})); }""", code[:3] + ' ' + code[3:])
    expect(field).to_have_value(code)

def recover_auth_storage(page, email, label):
    """Exercise the actual Firebase SDK when its persistence write fails.

    Only this isolated page's Firebase Auth database writes are interrupted.
    Read transactions, app session storage, Firestore and every other database
    retain their real browser behavior; no token is exposed to the test process.
    """
    requests = {'send': 0, 'verify': 0, 'sdkSignIn': 0}
    def record(request):
        if request.method != 'POST': return
        path = urlparse(request.url).path
        if path.endswith('/requestClientOtp'): requests['send'] += 1
        elif path.endswith('/verifyClientOtp'): requests['verify'] += 1
        elif 'accounts:signInWithCustomToken' in path: requests['sdkSignIn'] += 1
    page.on('request', record)
    page.add_init_script("""(() => {
      const key = 'majstorsada.clientOtp.v1';
      const set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
      window.__otpRecoveryStorageOps = [];
      Storage.prototype.setItem = function(name, value) {
        if (name === key) window.__otpRecoveryStorageOps.push('set');
        return set.apply(this, arguments);
      };
      Storage.prototype.removeItem = function(name) {
        if (name === key) window.__otpRecoveryStorageOps.push('remove');
        return remove.apply(this, arguments);
      };
    })();""")
    begin(page, email)
    expect(page.get_by_label('Šestocifreni kod', exact=True)).to_be_visible(timeout=60000)
    paste(page, code_for(email))
    login_url = page.url
    page.evaluate("""() => {
      const transaction = IDBDatabase.prototype.transaction;
      window.__otpAuthStorageFault = { active: true, denied: 0 };
      IDBDatabase.prototype.transaction = function(stores, mode) {
        if (window.__otpAuthStorageFault.active && this.name === 'firebaseLocalStorageDb' && mode === 'readwrite') {
          window.__otpAuthStorageFault.denied++;
          throw new DOMException("Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.", 'InvalidStateError');
        }
        return transaction.apply(this, arguments);
      };
    }""")
    page.get_by_role('button', name='Potvrdi kod i nastavi', exact=False).click()
    finish = page.get_by_role('button', name='Dovrši prijavu', exact=False)
    alert = page.get_by_role('alert')
    expect(finish).to_be_visible(timeout=60000)
    expect(finish).to_be_enabled(timeout=60000)
    expect(page.get_by_role('heading', name='Dovršite prijavu', exact=True)).to_be_visible()
    expect(alert).to_contain_text('sačuva prijavu')
    assert page.url == login_url, 'failed persistence must not navigate using an in-memory session'
    partial = page.evaluate("""() => ({
      userAssigned: !!window.useNuxtApp().$firebaseAuth.currentUser,
      denied: window.__otpAuthStorageFault.denied,
      noSensitiveFlow: (() => { const raw = sessionStorage.getItem('majstorsada.clientOtp.v1'); return !!raw && !/customToken|"code"/.test(raw); })()
    })""")
    assert partial['userAssigned'], 'real Firebase SDK must have assigned currentUser before the interrupted write'
    assert partial['denied'] > 1, 'the fault must survive the SDK transaction retries'
    assert partial['noSensitiveFlow'], 'the pending app flow must not persist an OTP or custom token'
    assert requests == {'send': 1, 'verify': 1, 'sdkSignIn': 1}, requests
    assert len(outbox(email)) == 1
    page.screenshot(path=str(ART / f'{label}-storage-failed.png'), full_page=True)

    # A persistent browser problem must remain retryable and must not be
    # mistaken for an account change, reconsume the OTP or send another email.
    denied_before = partial['denied']
    finish.click()
    page.wait_for_function('(before) => window.__otpAuthStorageFault.denied > before', arg=denied_before, timeout=30000)
    expect(finish).to_be_enabled(timeout=60000)
    expect(alert).to_contain_text('sačuva prijavu')
    expect(alert).not_to_contain_text('Nalog je promenjen')
    assert page.url == login_url
    assert page.evaluate('!!window.useNuxtApp().$firebaseAuth.currentUser')
    assert requests == {'send': 1, 'verify': 1, 'sdkSignIn': 2}, requests
    assert len(outbox(email)) == 1

    # Clearing the fault alone does not complete login; an explicit retry must
    # run the SDK sign-in again so the browser session is actually persisted.
    page.evaluate('window.__otpAuthStorageFault.active = false')
    assert page.url == login_url
    finish.click()
    page.wait_for_url('**/zahtev?tip=bravar', timeout=60000)
    ready(page)
    # The URL commit precedes Vue rendering the new route. Wait for the real
    # private request view so an early reload cannot interrupt SPA navigation.
    expect(page.get_by_role('heading', name='Hajde da rešimo kvar.', exact=True)).to_be_visible(timeout=60000)
    assert urlparse(page.url).path == '/zahtev'
    assert page.evaluate('!!window.useNuxtApp().$firebaseAuth.currentUser')
    assert requests == {'send': 1, 'verify': 1, 'sdkSignIn': 3}, requests
    assert len(outbox(email)) == 1
    try:
        page.wait_for_function("sessionStorage.getItem('majstorsada.clientOtp.v1') === null", timeout=3000)
    except PlaywrightTimeout:
        pass
    cleanup = page.evaluate("""() => {
      const raw = sessionStorage.getItem('majstorsada.clientOtp.v1');
      let state = { missing: raw === null };
      if (raw !== null) {
        try {
          const parsed = JSON.parse(raw);
          state = { missing: false, active: !!parsed.active, pending: !!parsed.pending, length: raw.length };
        } catch { state = { missing: false, malformed: true, length: raw.length }; }
      }
      return {
        storage: state,
        storageOperations: window.__otpRecoveryStorageOps.slice(),
        path: window.location.pathname,
        authUserPresent: !!window.useNuxtApp().$firebaseAuth.currentUser
      };
    }""")
    cleanup['requestCounts'] = dict(requests)
    if not cleanup['storage']['missing']:
        (ART / f'{label}-storage-state-failure.json').write_text(json.dumps(cleanup, ensure_ascii=False, indent=2), encoding='utf-8')
    assert cleanup['storage']['missing'], cleanup
    assert page.locator('body').evaluate('(element) => element.scrollWidth <= window.innerWidth + 1')
    page.screenshot(path=str(ART / f'{label}-storage-recovered.png'), full_page=True)
    page.reload(wait_until='domcontentloaded'); ready(page)
    try:
        page.wait_for_url('**/zahtev?tip=bravar', timeout=60000)
        expect(page.get_by_role('heading', name='Hajde da rešimo kvar.', exact=True)).to_be_visible(timeout=60000)
        page.wait_for_function('!!window.useNuxtApp().$firebaseAuth.currentUser', timeout=30000)
        assert urlparse(page.url).path == '/zahtev', 'a refresh must preserve the recovered authenticated session'
    except (AssertionError, PlaywrightTimeout):
        reloaded = page.evaluate("""() => ({
          path: window.location.pathname,
          headings: Array.from(document.querySelectorAll('h1')).map(element => element.textContent?.trim()).slice(0, 10),
          authUserPresent: (() => { try { return !!window.useNuxtApp().$firebaseAuth.currentUser; } catch { return false; } })(),
          noSensitiveFlow: (() => { const raw = sessionStorage.getItem('majstorsada.clientOtp.v1'); return raw === null || !/customToken|"code"/.test(raw); })()
        })""")
        reloaded['requestCounts'] = dict(requests)
        (ART / f'{label}-storage-reload-failure.json').write_text(json.dumps(reloaded, ensure_ascii=False, indent=2), encoding='utf-8')
        page.screenshot(path=str(ART / f'{label}-storage-reload-failure.png'), full_page=True)
        raise
    assert requests == {'send': 1, 'verify': 1, 'sdkSignIn': 3}, requests
    assert len(outbox(email)) == 1
    return {'attempts': requests['sdkSignIn'], 'persistentSession': True}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel=os.environ.get('E2E_BROWSER_CHANNEL') or None)
    contexts = []
    errors = []
    def context(mobile=False):
        c = browser.new_context(service_workers='block', viewport={'width':390,'height':844} if mobile else {'width':1280,'height':900})
        def traffic(route):
            if urlparse(route.request.url).hostname in ('localhost','127.0.0.1') or route.request.url.startswith(('blob:','data:')): route.continue_()
            else: route.abort()
        c.route('**/*', traffic)
        c.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
        contexts.append(c)
        return c
    try:
        desktop = context(); page = desktop.new_page()
        storage_trace = []
        page.expose_function('__recordOtpStorage', lambda action: storage_trace.append(action))
        page.add_init_script("""(() => {
          const key = 'majstorsada.clientOtp.v1';
          const set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
          Storage.prototype.setItem = function(name, value) { if (name === key) window.__recordOtpStorage('set'); return set.apply(this, arguments); };
          Storage.prototype.removeItem = function(name) { if (name === key) window.__recordOtpStorage('remove'); return remove.apply(this, arguments); };
        })();""")
        email = 'otp-browser-desktop@example.test'
        begin(page, email)
        field = page.get_by_label('Šestocifreni kod', exact=True)
        expect(field).to_be_visible(timeout=60000)
        expect(field).to_have_attribute('autocomplete', 'one-time-code')
        expect(field).to_have_attribute('inputmode', 'numeric')
        expect(field).to_be_focused()
        page.screenshot(path=str(ART / 'desktop-code.png'), full_page=True)
        actual = code_for(email)
        field.fill('111111' if actual != '111111' else '222222')
        page.get_by_role('button', name='Potvrdi kod i nastavi', exact=False).click()
        expect(page.get_by_role('alert')).to_be_visible(timeout=30000)
        assert len(outbox(email)) == 1
        page.reload(wait_until='domcontentloaded'); ready(page)
        expect(field).to_be_visible(); expect(field).to_have_value('')
        assert len(outbox(email)) == 1, 'reload must not request a new OTP'
        def lose_verify(route):
            route.fetch(timeout=60000)
            route.abort()
        page.route('**/verifyClientOtp', lose_verify, times=1)
        paste(page, actual)
        page.get_by_role('button', name='Potvrdi kod i nastavi', exact=False).click()
        expect(page.get_by_role('alert')).to_be_visible(timeout=30000)
        page.get_by_role('button', name='Potvrdi kod i nastavi', exact=False).click()
        page.wait_for_url('**/zahtev?tip=bravar', timeout=60000)
        assert len(outbox(email)) == 1
        try:
            page.wait_for_function("sessionStorage.getItem('majstorsada.clientOtp.v1') === null", timeout=3000)
        except PlaywrightTimeout:
            pass
        storage_state = page.evaluate("""() => { const raw = sessionStorage.getItem('majstorsada.clientOtp.v1'); if (raw === null) return {missing:true}; try { const parsed = JSON.parse(raw); return {missing:false, active:!!parsed.active, pending:!!parsed.pending, length:raw.length}; } catch { return {missing:false, malformed:true, length:raw.length}; } }""")
        assert storage_state['missing'], {'storage': storage_state, 'storageOperations': storage_trace, 'url': page.url}

        mobile = context(True); phone = mobile.new_page()
        mobile_email = 'otp-browser-mobile@example.test'
        def lose_send(route):
            route.fetch(timeout=60000)
            route.abort()
        phone.route('**/requestClientOtp', lose_send, times=1)
        begin(phone, mobile_email)
        retry = phone.get_by_role('button', name='Proveri isti zahtev', exact=True)
        expect(retry).to_be_visible(timeout=60000); expect(retry).to_be_enabled(timeout=60000)
        assert len(outbox(mobile_email)) == 1
        phone.reload(wait_until='domcontentloaded'); ready(phone)
        expect(retry).to_be_visible()
        retry.click()
        mobile_field = phone.get_by_label('Šestocifreni kod', exact=True)
        expect(mobile_field).to_be_visible(timeout=60000)
        assert len(outbox(mobile_email)) == 1, 'same-ID status retry must not send again'
        assert phone.locator('body').evaluate('(element) => element.scrollWidth <= window.innerWidth + 1')
        phone.screenshot(path=str(ART / 'mobile-code.png'), full_page=True)
        verify_requests = []
        phone.on('request', lambda request: verify_requests.append(request.url) if request.url.endswith('/verifyClientOtp') else None)
        def fail_role(route): route.fulfill(status=503, json={'ok':False,'code':'unavailable','error':'Kontrolisana greška naloga'})
        phone.route('**/resolveAccount', fail_role, times=1)
        paste(phone, code_for(mobile_email))
        phone.get_by_role('button', name='Potvrdi kod i nastavi', exact=False).click()
        finish = phone.get_by_role('button', name='Dovrši prijavu', exact=False)
        expect(finish).to_be_visible(timeout=60000); expect(finish).to_be_enabled(timeout=60000)
        saved = phone.evaluate("sessionStorage.getItem('majstorsada.clientOtp.v1')")
        assert 'customToken' not in saved and '"code"' not in saved
        finish.click()
        phone.wait_for_url('**/zahtev?tip=bravar', timeout=60000)
        assert len(verify_requests) == 1, 'role retry must not consume the OTP again'
        assert len(outbox(mobile_email)) == 1
        storage_recovery = {}
        for is_mobile, label in [(False, 'desktop'), (True, 'mobile')]:
            recovery_context = context(is_mobile)
            recovery_page = recovery_context.new_page()
            storage_recovery[label] = recover_auth_storage(recovery_page, f'otp-browser-storage-{label}@example.test', label)
        print(json.dumps({'otpBrowser':'passed','desktop':'wrong code, paste, reload, lost verify response','mobile':'lost send response, same-ID retry, role retry','authStorageRecovery':storage_recovery,'browserErrors':errors}), flush=True)
        assert not errors, errors
    finally:
        for c in contexts: c.close()
        browser.close()
