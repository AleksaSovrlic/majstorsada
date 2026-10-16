import { randomUUID } from 'node:crypto'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { defineBoolean, defineInt, defineSecret, defineString } from 'firebase-functions/params'
import { HttpsError, onRequest } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import { createOtpHandler, createTurnstileVerifier, isOtpDemoEnvironment } from './otpHttp'
import { createOtpService } from './otpService'
import { createOtpDiagnostics } from './otpDiagnostics'

export const otpEnabled = defineBoolean('OTP_ENABLED', { default: false })
const publicEnabled = defineBoolean('OTP_PUBLIC_ENABLED', { default: false })
const sendEnabled = defineBoolean('OTP_SEND_ENABLED', { default: true })
const testEmails = defineString('OTP_TEST_EMAILS', { default: '' })
const runtimeAccount = defineString('OTP_RUNTIME_SERVICE_ACCOUNT', { default: 'otp-runtime@majstorsada-b2ad4.iam.gserviceaccount.com' })
const awsRole = defineString('OTP_AWS_ROLE_ARN', { default: '' })
const audience = defineString('OTP_AWS_AUDIENCE', { default: 'majstorsada-otp-ses' })
const googleSubject = defineString('OTP_GOOGLE_SUBJECT', { default: '' })
const proxyHops = defineInt('OTP_TRUSTED_PROXY_HOPS', { default: 0 })
const dailyLimit = defineInt('OTP_DAILY_LIMIT', { default: 500 })
const diagnosticWindowStart = defineString('OTP_DIAGNOSTICS_WINDOW_START', { default: '' })
const diagnosticOwnerSubject = defineString('OTP_DIAGNOSTIC_GOOGLE_SUBJECT', { default: '' })
const diagnosticOwnerEmail = defineString('OTP_DIAGNOSTIC_GOOGLE_EMAIL', { default: '' })
const hmacSecret = defineSecret('OTP_HMAC_SECRET')
const botSecret = defineSecret('OTP_TURNSTILE_SECRET')
const allowedEmails = () => publicEnabled.value() ? undefined : testEmails.value().split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
let service: ReturnType<typeof createOtpService> | undefined
let servicePromise: Promise<ReturnType<typeof createOtpService>> | undefined
let bot: ReturnType<typeof createTurnstileVerifier> | undefined
type SesOtpSender = ReturnType<typeof import('./otpTransport').createSesOtpSender>
let sesSenderPromise: Promise<SesOtpSender> | undefined
async function sendSesOtpMail(...args: Parameters<SesOtpSender>) {
  // Verification and replayed requests never initialize the AWS SDK or provider.
  const initializing = sesSenderPromise ||= import('./otpTransport').then(transport => transport.createSesOtpSender({
    roleArn: awsRole.value(), audience: audience.value(), googleSubject: googleSubject.value(), region: 'eu-central-1',
  }))
  let sender: SesOtpSender
  try { sender = await initializing }
  catch {
    if (sesSenderPromise === initializing) sesSenderPromise = undefined
    // Initialization has not attempted delivery; expose no provider details.
    throw Object.assign(new Error('OTP email transport failed'), {
      name: 'OtpDeliveryError', definitive: true, stage: 'configuration', category: 'explicit-rejection',
    })
  }
  // A failed delivery retains the shared sender and is never retried here.
  return sender(...args)
}
async function getService() {
  if (service) return service
  if (servicePromise) return servicePromise
  servicePromise = (async () => {
  const demo = isOtpDemoEnvironment(), db = getFirestore()
  const app = getApps().find(app => app.name === 'otp-client') || initializeApp({ projectId: process.env.GCLOUD_PROJECT, serviceAccountId: runtimeAccount.value() }, 'otp-client')
  const sender = demo ? async (email: string, code: string) => {
    // No test outbox is reachable unless BOTH SDKs point at local demo emulators.
    if (!isOtpDemoEnvironment()) throw new Error('OTP demo environment changed')
    const id = randomUUID()
    await db.doc('_otpTestOutbox/' + id).create({ email, code, createdAt: Date.now() })
    return { messageId: id }
  } : sendSesOtpMail
  service = createOtpService({ db, auth: getAuth(app), secret: hmacSecret.value(), sendMail: sender, allowedEmails: allowedEmails(), dailyLimit: dailyLimit.value(), onEvent: event => logger.info('OTP operational event', event) })
  return service
  })()
  try { return await servicePromise } finally { servicePromise = undefined }
}
async function verifyBot(token: string, context: { requestId: string; ip: string }) {
  if (isOtpDemoEnvironment()) {
    if (token !== 'demo-turnstile-token') throw new HttpsError('permission-denied', 'Ponovite proveru pre slanja koda.')
    return
  }
  bot ||= createTurnstileVerifier({ secret: botSecret.value(), hostnames: ['majstorsada.rs', 'www.majstorsada.rs'], action: 'client_otp' })
  await bot(token, context)
}
const options = { region: 'europe-west3', serviceAccount: runtimeAccount, minInstances: 0, maxInstances: 2, concurrency: 10, memory: '256MiB' as const, timeoutSeconds: 60, invoker: 'public' as const }
const diagnostics = createOtpDiagnostics({ windowStartedAt: () => diagnosticWindowStart.value(),
  ownerSubject: () => diagnosticOwnerSubject.value(), ownerEmail: () => diagnosticOwnerEmail.value(),
  businessEnabled: () => otpEnabled.value(), publicEnabled: () => publicEnabled.value() })
const boundary = { diagnostics, enabled: () => otpEnabled.value(), allowedEmails, serviceFactory: getService, trustedProxyHops: () => proxyHops.value(), demo: isOtpDemoEnvironment, onInternalError: (code: string) => logger.error('OTP internal failure', { code }) }
export const requestClientOtp = onRequest({ ...options, secrets: [hmacSecret, botSecret] }, createOtpHandler({ ...boundary, enabled: () => otpEnabled.value() && sendEnabled.value(), operation: 'request', verifyBot }))
export const verifyClientOtp = onRequest({ ...options, secrets: [hmacSecret] }, createOtpHandler({ ...boundary, operation: 'verify' }))
