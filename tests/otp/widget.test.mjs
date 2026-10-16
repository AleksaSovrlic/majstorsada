import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import { parse, compileScript } from '@vue/compiler-sfc'
import { markRaw, ref } from 'vue'

// Compile the actual component setup, rather than reimplement its widget flow.
// Provider/DOM mocks keep these tests local; real Cloudflare pairing and iframe
// layout remain acceptance checks on the approved domain.
const { descriptor, errors } = parse(readFileSync('app/components/ClientOtpLogin.vue', 'utf8'))
assert.deepEqual(errors, [])
const source = stripTypeScriptTypes(compileScript(descriptor, { id: 'otp-widget-test' }).content)
const loaderSource = stripTypeScriptTypes(readFileSync('app/utils/clientOtpTurnstile.ts', 'utf8'))
const REQUEST_ID = '01234567-89ab-4cde-8f01-23456789abcd'
const flush = async () => { for (let n = 0; n < 3; n++) await new Promise(setImmediate) }

async function fixture(options = {}) {
  const calls = { renders: [], executes: [], removes: [], tokens: [], sends: [], scripts: [], disposed: 0 }
  const timers = new Map()
  let hooks
  let timerId = 0, widgetId = 0, existingScript = null
  const turnstile = {
    render: (element, config) => {
      if (options.renderError) throw new Error('fixture render failure')
      const id = `widget-${++widgetId}`
      calls.renders.push({ id, element, config })
      return id
    },
    execute: id => { calls.executes.push(id); if (options.executeError) throw new Error('fixture execute failure') },
    remove: id => calls.removes.push(id)
  }
  const window = { ...(options.lazy ? {} : { turnstile }) }
  function createScript() {
    const listeners = new Map()
    return {
      dataset: {}, src: '', async: false, defer: false,
      addEventListener: (type, callback) => listeners.set(type, callback),
      removeEventListener: (type, callback) => { if (listeners.get(type) === callback) listeners.delete(type) },
      remove() { if (existingScript === this) existingScript = null; this.removed = true },
      dispatch: type => listeners.get(type)?.(),
      listeners
    }
  }
  const document = {
    querySelector: selector => { assert.equal(selector, 'script[data-client-otp-turnstile]'); return existingScript },
    createElement: tag => { assert.equal(tag, 'script'); return createScript() },
    head: { appendChild: script => { calls.scripts.push(script); existingScript = script } }
  }
  const flow = Object.fromEntries(['email', 'code', 'error', 'info', 'busy', 'finishing', 'active', 'pending', 'now', 'cooldown', 'expiresIn', 'waiting', 'completionPending', 'canResumeAfterExpiry'].map(name => [name, ref(null)]))
  Object.assign(flow, {
    restore() {}, verify: async () => {}, changeEmail() {}, continueExistingSession: async () => {},
    dispose: () => { calls.disposed++ },
    send: async (getToken, fresh) => { calls.sends.push(fresh); calls.tokens.push(await getToken(REQUEST_ID)) }
  })
  const context = vm.createContext({
    window, document, AbortController,
    useRuntimeConfig: () => ({ public: { turnstileSiteKey: options.noKey ? '' : 'fixture-public-site-key', firebase: { projectId: options.projectId || 'production-shaped-fixture' } } }),
    setTimeout: (callback, milliseconds) => { const id = ++timerId; timers.set(id, { callback, milliseconds }); return id },
    clearTimeout: id => timers.delete(id), setInterval: () => ++timerId, clearInterval() {},
    fetch: () => { throw new Error('External calls are forbidden in widget tests') }
  })
  const imports = {
    vue: { defineComponent: value => value, nextTick: async () => {}, ref, onMounted: callback => hooks.mounted.push(callback), onBeforeUnmount: callback => hooks.unmounted.push(callback) },
    '@/composables/useClientOtp': { useClientOtp: () => flow }
  }
  const loader = new vm.SourceTextModule(loaderSource, { context })
  await loader.link(() => {})
  const component = new vm.SourceTextModule(source, { context, initializeImportMeta: meta => { meta.dev = options.dev ?? false } })
  await component.link(name => {
    if (name === '@/utils/clientOtpTurnstile') return loader
    const exports = imports[name]
    assert.ok(exports, 'Unexpected component import ' + name)
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value) }, { context })
  })
  await component.evaluate()
  function createInstance() {
    hooks = { mounted: [], unmounted: [] }
    const instanceHooks = hooks
    const api = component.namespace.default.setup({ from: '/zahtev?tip=vodoinstalater' }, { expose() {} })
    const container = markRaw({ clientWidth: options.width || 240 })
    api.botContainer.value = container
    return {
      api, container,
      mount: () => instanceHooks.mounted.forEach(callback => callback()),
      unmount: () => instanceHooks.unmounted.forEach(callback => callback())
    }
  }
  return {
    ...createInstance(), calls, timers, window, turnstile, remount: createInstance,
    complete: (token = 'fixture-turnstile-token') => calls.renders.at(-1).config.callback(token),
    fireTimeout: milliseconds => {
      const entry = [...timers].find(([, timer]) => timer.milliseconds === milliseconds)
      assert.ok(entry, `Expected timer ${milliseconds}`); timers.delete(entry[0]); entry[1].callback()
    }
  }
}

test('real send waits for a compact widget token and retains the request binding', async () => {
  const f = await fixture()
  assert.equal(f.calls.renders.length, 0, 'setup must not create a challenge')
  const sending = f.api.sendCode(false)
  await flush()
  const { config, element, id } = f.calls.renders[0]
  assert.equal(element, f.container)
  assert.equal(config.sitekey, 'fixture-public-site-key')
  assert.equal(config.action, 'client_otp')
  assert.equal(config.cData, REQUEST_ID)
  assert.equal(config.execution, 'execute')
  assert.equal(config.appearance, 'interaction-only')
  assert.equal(config.size, 'compact', 'Cloudflare compact fits the 240px inner width at a 320px viewport')
  assert.deepEqual(f.calls.executes, [id])
  assert.deepEqual(f.calls.tokens, [], 'the request must wait for provider success')
  f.complete('bound-token'); await sending
  assert.deepEqual(f.calls.tokens, ['bound-token'])
  assert.deepEqual(f.calls.sends, [false])
  assert.equal(f.timers.size, 0)
  const containerMarkup = descriptor.template.content.match(/<div\s+ref="botContainer"[^>]*>/)?.[0]
  assert.ok(containerMarkup)
  assert.match(containerMarkup, /class="[^"]*\bflex\s+justify-center\b/)
  assert.doesNotMatch(containerMarkup, /overflow-hidden/, 'an interactive challenge must not be clipped')
})

test('each explicit attempt removes the previous widget and binds the new request ID', async () => {
  const f = await fixture()
  const first = f.api.botToken(REQUEST_ID); await flush(); f.complete(); await first
  const retryId = 'fedcba98-7654-4321-8abc-0123456789ab'
  const second = f.api.botToken(retryId); await flush()
  assert.deepEqual(f.calls.removes, ['widget-1'])
  assert.equal(f.calls.renders[1].config.cData, retryId)
  assert.deepEqual(f.calls.executes, ['widget-1', 'widget-2'])
  f.complete('retry-token'); assert.equal(await second, 'retry-token')
})

for (const callback of ['error-callback', 'expired-callback', 'timeout-callback']) {
  test(`${callback} rejects an incomplete check and clears the pending timeout`, async () => {
    const f = await fixture()
    const promise = f.api.botToken(REQUEST_ID)
    const rejected = assert.rejects(promise, /Bezbednosna provera nije završena/)
    await flush(); f.calls.renders[0].config[callback](); await rejected
    assert.deepEqual(f.calls.tokens, [])
    assert.equal(f.timers.size, 0)
    const retry = f.api.botToken(REQUEST_ID); await flush(); f.complete(); await retry
    assert.deepEqual(f.calls.removes, ['widget-1'])
  })
}

test('a stalled challenge has a bounded wait and remains retryable', async () => {
  const f = await fixture()
  const promise = f.api.botToken(REQUEST_ID)
  const rejected = assert.rejects(promise, /Bezbednosna provera nije završena/)
  await flush(); f.fireTimeout(120_000); await rejected
  assert.equal(f.timers.size, 0)
  const retry = f.api.botToken(REQUEST_ID); await flush(); f.complete(); await retry
})

for (const kind of ['renderError', 'executeError']) {
  test(`${kind} cannot produce a token or leave an active timeout`, async () => {
    const f = await fixture({ [kind]: true })
    await assert.rejects(f.api.botToken(REQUEST_ID), /Bezbednosna provera nije završena/)
    assert.equal(f.timers.size, 0)
    assert.deepEqual(f.calls.tokens, [])
  })
}

test('unmount cancels an active check, disposes its flow, and removes its widget', async () => {
  const f = await fixture()
  const promise = f.api.botToken(REQUEST_ID)
  const rejected = assert.rejects(promise, /Bezbednosna provera nije završena/)
  await flush(); f.unmount(); await rejected
  assert.equal(f.calls.disposed, 1)
  assert.deepEqual(f.calls.removes, ['widget-1'])
  assert.equal(f.timers.size, 0)
  await assert.rejects(f.api.botToken(REQUEST_ID), /Prijava je prekinuta/)
  assert.equal(f.calls.renders.length, 1)
})

test('an explicit send can load the provider when mounting has not preloaded it', async () => {
  const f = await fixture({ lazy: true })
  assert.deepEqual(f.calls.scripts, [])
  const promise = f.api.botToken(REQUEST_ID)
  await flush()
  const script = f.calls.scripts[0]
  assert.equal(script.src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')
  assert.equal(script.async, true); assert.equal(script.defer, true)
  assert.equal(f.calls.renders.length, 0)
  f.window.turnstile = f.turnstile; script.dispatch('load'); await flush()
  assert.equal(script.listeners.size, 0)
  assert.equal(f.calls.renders.length, 1)
  f.complete(); await promise
  assert.equal(f.timers.size, 0)
})

for (const failure of ['error', 'timeout', 'missing-api']) {
  test(`script ${failure} fails locally before any widget executes`, async () => {
    const f = await fixture({ lazy: true })
    const promise = f.api.botToken(REQUEST_ID)
    const rejected = assert.rejects(promise, /Bezbednosna provera nije (dostupna|spremna)/)
    await flush()
    const script = f.calls.scripts[0]
    if (failure === 'timeout') f.fireTimeout(12_000)
    else script.dispatch(failure === 'error' ? 'error' : 'load')
    await rejected
    assert.equal(script.removed, true)
    assert.equal(script.listeners.size, 0)
    assert.equal(f.timers.size, 0)
    assert.deepEqual(f.calls.executes, [])
  })
}

test('unmount during script loading prevents a late API from creating a widget', async () => {
  const f = await fixture({ lazy: true })
  const promise = f.api.botToken(REQUEST_ID)
  const rejected = assert.rejects(promise, /Prijava je prekinuta/)
  await flush(); f.unmount()
  f.window.turnstile = f.turnstile; f.calls.scripts[0].dispatch('load'); await rejected
  assert.deepEqual(f.calls.renders, [])
  assert.equal(f.timers.size, 0)
})

test('missing configuration cannot trigger a provider request', async () => {
  const f = await fixture({ noKey: true, lazy: true })
  await assert.rejects(f.api.botToken(REQUEST_ID), /Prijava kodom još nije dostupna/)
  assert.deepEqual(f.calls.scripts, [])
  assert.deepEqual(f.calls.renders, [])
})

for (const { dev, projectId, bypass } of [
  { dev: true, projectId: 'demo-majstorsada-widget', bypass: true },
  { dev: false, projectId: 'demo-majstorsada-widget', bypass: false },
  { dev: true, projectId: 'production-shaped-fixture', bypass: false }
]) {
  test(`provider bypass requires both a dev build and demo project: dev=${dev}, project=${projectId}`, async () => {
    const f = await fixture({ dev, projectId })
    const promise = f.api.botToken(REQUEST_ID)
    await flush()
    if (bypass) {
      assert.equal(await promise, 'demo-turnstile-token')
      assert.deepEqual(f.calls.renders, [])
    } else {
      assert.equal(f.calls.renders.length, 1)
      f.complete(); assert.equal(await promise, 'fixture-turnstile-token')
    }
    assert.equal(f.timers.size, 0)
  })
}

test('login mount preloads only the script and creates no token or OTP send', async () => {
  const f = await fixture({ lazy: true })
  assert.equal(f.calls.scripts.length, 0, 'import and setup must have no provider side effect')
  f.mount(); await flush()
  assert.equal(f.calls.scripts.length, 1, 'the script starts before the send click')
  assert.equal(f.calls.renders.length, 0)
  assert.equal(f.calls.executes.length, 0)
  assert.equal(f.calls.sends.length, 0)
  assert.equal(f.calls.tokens.length, 0)
  f.window.turnstile = f.turnstile; f.calls.scripts[0].dispatch('load'); await flush()
  assert.equal(f.timers.size, 0)
  assert.equal(f.calls.renders.length, 0, 'script readiness alone cannot start a challenge')
  const send = f.api.sendCode(false); await flush()
  assert.equal(f.calls.scripts.length, 1)
  assert.equal(f.calls.renders[0].config.cData, REQUEST_ID)
  f.complete(); await send
  f.unmount()
})

test('concurrent login mounts and sends share one script load with separate request-bound widgets', async () => {
  const f = await fixture({ lazy: true })
  const second = f.remount()
  f.mount(); second.mount()
  const firstToken = f.api.botToken(REQUEST_ID)
  const secondId = 'fedcba98-7654-4321-8abc-0123456789ab'
  const secondToken = second.api.botToken(secondId)
  await flush()
  assert.equal(f.calls.scripts.length, 1)
  assert.equal(f.calls.scripts[0].listeners.size, 2)
  assert.equal([...f.timers.values()].filter(timer => timer.milliseconds === 12_000).length, 1)
  f.window.turnstile = f.turnstile; f.calls.scripts[0].dispatch('load'); await flush()
  assert.equal(f.calls.renders.length, 2)
  assert.deepEqual(f.calls.renders.map(render => render.config.cData), [REQUEST_ID, secondId])
  f.calls.renders[0].config.callback('first-token'); f.calls.renders[1].config.callback('second-token')
  assert.deepEqual(await Promise.all([firstToken, secondToken]), ['first-token', 'second-token'])
  assert.equal(f.timers.size, 0)
  f.unmount(); second.unmount()
})

test('unmounted loader waiter rejects immediately while a remounted login reuses the loading script', async () => {
  const f = await fixture({ lazy: true })
  f.mount()
  const oldToken = f.api.botToken(REQUEST_ID)
  const rejected = assert.rejects(oldToken, /Prijava je prekinuta/)
  await flush(); f.unmount(); await rejected
  assert.equal(f.calls.renders.length, 0)
  const next = f.remount(); next.mount()
  const newToken = next.api.botToken(REQUEST_ID)
  await flush()
  assert.equal(f.calls.scripts.length, 1)
  f.window.turnstile = f.turnstile; f.calls.scripts[0].dispatch('load'); await flush()
  assert.equal(f.calls.renders.length, 1)
  assert.equal(f.calls.renders[0].element, next.container)
  f.complete(); await newToken
  assert.equal(f.timers.size, 0)
  next.unmount()
})

for (const failure of ['error', 'timeout', 'missing-api']) {
  test(`a quiet preload ${failure} is cleaned up and a deliberate send starts one bounded recovery`, async () => {
    const f = await fixture({ lazy: true })
    f.mount(); await flush()
    const failed = f.calls.scripts[0]
    if (failure === 'timeout') f.fireTimeout(12_000)
    else failed.dispatch(failure === 'error' ? 'error' : 'load')
    await flush()
    assert.equal(failed.removed, true)
    assert.equal(failed.listeners.size, 0)
    assert.equal(f.timers.size, 0)
    assert.equal(f.calls.scripts.length, 1, 'preloading must not loop or retry automatically')
    assert.equal(f.api.error.value, null, 'preload must not display an error')
    assert.equal(f.calls.sends.length, 0)
    const send = f.api.sendCode(false); await flush()
    assert.equal(f.calls.scripts.length, 2)
    assert.equal([...f.timers.values()].filter(timer => timer.milliseconds === 12_000).length, 1)
    failed.dispatch('error'); failed.dispatch('load')
    assert.equal(f.calls.renders.length, 0, 'a stale removed script cannot settle the recovery')
    f.window.turnstile = f.turnstile; f.calls.scripts[1].dispatch('load'); await flush()
    f.complete(); await send
    assert.equal(f.calls.tokens.length, 1)
    assert.equal(f.timers.size, 0)
    f.unmount()
  })
}

test('unmount then script timeout cleans the shared loader so a future login can recover', async () => {
  const f = await fixture({ lazy: true })
  f.mount(); f.unmount()
  f.fireTimeout(12_000); await flush()
  assert.equal(f.calls.scripts[0].removed, true)
  const next = f.remount(); next.mount(); await flush()
  assert.equal(f.calls.scripts.length, 2)
  const token = next.api.botToken(REQUEST_ID)
  f.window.turnstile = f.turnstile; f.calls.scripts[1].dispatch('load'); await flush()
  f.complete(); await token
  assert.equal(f.timers.size, 0)
  next.unmount()
})

test('late callbacks from a settled widget cannot settle or uncancel a later check', async () => {
  const f = await fixture()
  const first = f.api.botToken(REQUEST_ID); await flush()
  const oldConfig = f.calls.renders[0].config
  oldConfig.callback('first-token'); await first
  const retry = f.api.botToken(REQUEST_ID)
  const rejected = assert.rejects(retry, /Bezbednosna provera nije završena/)
  await flush()
  oldConfig.callback('late-token'); oldConfig['error-callback']()
  assert.equal([...f.timers.values()].filter(timer => timer.milliseconds === 120_000).length, 1)
  f.unmount(); await rejected
  assert.equal(f.timers.size, 0)
})

for (const options of [{ noKey: true }, { dev: true, projectId: 'demo-majstorsada-widget' }]) {
  test(`login mount makes no provider request without required production configuration: ${JSON.stringify(options)}`, async () => {
    const f = await fixture({ ...options, lazy: true })
    f.mount(); await flush()
    assert.equal(f.calls.scripts.length, 0)
    assert.equal(f.calls.executes.length, 0)
    assert.equal(f.calls.sends.length, 0)
    f.unmount()
  })
}
