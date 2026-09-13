# Dependency maintenance checks

Use the root pinned Node 24 toolchain. The explicit development packages unplugin 3.3.0, cac 6.7.14 and commander 14.0.3 satisfy optional peer requirements of the new Nuxt toolchain; they are not new website features. Install the two source trees with `npm ci` and `npm ci --prefix functions`.

## Emulators

Firebase CLI is project-local. Java 21+ is required. `tools/emulator-env.mjs` uses an explicit `JAVA_HOME`, otherwise a single extracted runtime under ignored `.firebase/toolchains/java21/`, otherwise system Java. It changes only the environment of child processes. A fresh checkout needs Java installed or this local runtime prepared; the Java binary is intentionally not committed.

The local verification used Azul Zulu JRE 21.0.12.1, archive `zulu21.52.203-ca-jre21.0.12.1-win_x64.zip`, SHA-256 `37ad372b04da388c326f0507abec38b8e1d11e3bddf6128b215c8f0a06ff8177`, obtained from the publisher's API/CDN. Java compilation is not needed for Firebase emulators.

Run `npm run test:security`. It starts only local Firestore/Storage under a demo project. The original 96 tests remain; two SDK tests cover permanent-versus-temporary FCM errors and the production CORS adapter. The FCM test replaces only the outbound send method; it never sends real push messages.

## Browser and compiled SSR

The browser suite waits explicitly for Nuxt hydration before interacting with inspected pages; DOM readiness alone is insufficient on a cold Vite start. It also fails on hydration console errors during the private registration/recovery flows; account entries use a stable server loading shell and mount the private layout after browser-only Auth routing. The initial mode is kept in the Nuxt payload so cross-role redirects cannot swap layouts during hydration. Public entry pages retain SSR. The existing emulator browser suite also checks real local Auth tokens and HTTP body parsing through the Functions emulator. Firebase CLI forcibly enables permissive debug CORS; rejection of unrelated origins is therefore tested with the production SDK adapter separately, not inferred from the emulator.

Use Python with the versions in tests/requirements.txt (`python -m pip install -r tests/requirements.txt`) plus an available Chromium browser. For the local run, an ignored virtual environment was created under `.firebase/toolchains/browser/` with Playwright 1.62.0 and Pillow 12.3.0, using installed Edge:

```powershell
$env:E2E_PYTHON = (Resolve-Path .firebase/toolchains/browser/Scripts/python.exe).Path
$env:E2E_BROWSER_CHANNEL = 'msedge'
$env:PYTHONIOENCODING = 'utf-8'
npm run test:e2e
npm run build
npm run test:build
npm run test:ssr
```

Run emulator suites sequentially because they share some ports. The compiled SSR test uses port 3344 and refuses an existing listener. Browser requests to outside hosts are blocked; this test does not exercise production Auth, IAM, billing or actual message delivery. It starts the exact generated Firebase SSR export through a local HTTP host, checks its actual deployment metadata against the existing runtime budget (0–3 instances, 256 MiB, 60 s, concurrency 80, europe-west3), and serves generated JS/CSS assets.

`tests/build/seo-baseline.json` captures public titles, descriptions, headings, canonical URLs, robots directives and schema types from the accepted prior release, with one reviewed adjustment: schema-org 6 emits one Organization instead of the previous two. The three Service provider references now point to the emitted `#identity` node. Tests also reject dangling schema references and check the sitemap, private noindex routes, unknown routes and the empty disabled-island handler, browser errors and mobile horizontal overflow. Do not regenerate expectations merely to make a failing test pass.

Logs, local data and screenshots are ignored under `.firebase/`. The production build should always be regenerated from the intended release source before an approved deployment. The scripts do not automatically publish, commit or push.
