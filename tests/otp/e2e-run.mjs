// Runs only the existing guarded demo emulators, with a fake private mail outbox.
process.env.OTP_E2E_MODE = 'true'
process.env.OTP_TEST_BROWSER_SCRIPT = 'tests/otp/browser.py'
await import('../e2e/run.mjs')
