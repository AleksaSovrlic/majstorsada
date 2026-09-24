# Browser checks

The suite starts Auth, Firestore, Storage and Functions for demo-majstorsada-e2e, then Nuxt with tests/e2e/demo.env. It refuses a pre-existing server on port 3333. A deterministic Mapbox fixture replaces address search; all other external browser requests are blocked. Auth and application APIs use real emulators, without production data or real email/push delivery.

Prerequisites: locked Node dependencies, Java 21+, Python 3, Pillow and Playwright. See docs/dependency-checks.md for the isolated Java/Python setup and pinned tests/requirements.txt. For example, install playwright and pillow with pip, then run python -m playwright install chromium. E2E_PYTHON optionally selects Python. E2E_BROWSER_CHANNEL=msedge selects installed Edge. PYTHONIOENCODING=utf-8 avoids Windows console encoding issues.

Run from the repository root:

    npm --prefix functions run build
    node tests/e2e/run.mjs

Ports 3333, 8180, 9399, 9199, 5501, 4442, 4542 and 9150 must be free. Do not run alongside the security emulator suite. The runner creates a temporary demo-only Functions parameter file because the pinned CLI prompts for defaults, and removes its own file on normal exit. Logs/screenshots are ignored under .firebase/e2e.

The generic webapp-testing server helper was tried but left a child Nuxt process on Windows. This runner owns and terminates its server tree and refuses to reuse unrelated servers. Never terminate a process only because it uses the same port; verify ownership.

Coverage: registration interrupted after Auth creation, reload recovery, real local email-link login, lost create response, draft/photo recovery, zero-token viewing and acceptance rejection, authorized photo delivery, post-accept contact, admin token allocation, completion/rating, cross-role redirects, role lookup failure/recovery and cross-tab logout clearing both contact and request forms. API concurrency and rule attacks are separate in npm run test:security. Production IAM, index readiness, delivery and costs require release smoke checks.

Cost-control coverage also checks equal-timestamp history pages (3/6/7), tradesperson history and filtered reviews, expired-job prefilling and the daily-limit message. A feed with its first twenty jobs dismissed must still expose the next window; a near-term deadline removes that job without reloading the page. Wait for the actual availability switch after navigation, then assert aria-checked, before expecting incoming jobs.

Do not run Nuxt build concurrently with the browser dev server: they share generated Nuxt artifacts. Compiled SSR checks require the same E2E_PYTHON and E2E_BROWSER_CHANNEL environment settings as this suite.
