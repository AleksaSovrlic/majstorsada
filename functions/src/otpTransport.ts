import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { STSClient, AssumeRoleWithWebIdentityCommand } from '@aws-sdk/client-sts'

export type TemporaryCredentials = { accessKeyId: string; secretAccessKey: string; sessionToken: string; expiration: Date }
export type OtpDeliveryStage = 'metadata' | 'federation' | 'ses' | 'configuration'
export type OtpDeliveryCategory = 'explicit-rejection' | 'ambiguous'
export class OtpDeliveryError extends Error {
  readonly category: OtpDeliveryCategory
  constructor(public readonly definitive: boolean, public readonly stage: OtpDeliveryStage = 'configuration') {
    super('OTP email transport failed'); this.name = 'OtpDeliveryError'
    // This describes the email dispatch outcome, not a raw provider error.
    this.category = definitive ? 'explicit-rejection' : 'ambiguous'
  }
}
interface CredentialConfig {
  roleArn: string
  audience: string
  googleSubject: string
  region?: string
  now?: () => number
  metadataFetch?: typeof fetch
  assumeRole?: (input: any) => Promise<any>
}

// Each instance shares one refresh. Only short-lived AWS credentials are cached.
export function createGoogleAwsCredentials(config: CredentialConfig) {
  if (!/^arn:aws:iam::\d{12}:role\/[A-Za-z0-9_+=,.@/-]{1,512}$/.test(config.roleArn)
    || !/^[A-Za-z0-9:/._-]{1,200}$/.test(config.audience)
    || !/^\d{10,30}$/.test(config.googleSubject)) throw new Error('OTP workload identity configuration is incomplete')
  const now = config.now || Date.now, request = config.metadataFetch || fetch
  const sts = new STSClient({ region: config.region || 'eu-central-1', maxAttempts: 1,
    requestHandler: { connectionTimeout: 3000, requestTimeout: 5000 } })
  const assumeRole = config.assumeRole || (input => sts.send(new AssumeRoleWithWebIdentityCommand(input)))
  let cached: TemporaryCredentials | undefined, refreshing: Promise<TemporaryCredentials> | undefined
  return async (): Promise<TemporaryCredentials> => {
    if (cached && cached.expiration.getTime() - now() > 120_000) return cached
    if (refreshing) return refreshing
    refreshing = (async () => {
      let stage: 'metadata' | 'federation' = 'metadata'
      try {
        const url = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=' + encodeURIComponent(config.audience) + '&format=full'
        const response = await request(url, { headers: { 'Metadata-Flavor': 'Google' }, redirect: 'error', signal: AbortSignal.timeout(5000) })
        if (!response.ok || response.headers.get('metadata-flavor') !== 'Google') throw new OtpDeliveryError(true, 'metadata')
        const token = await response.text()
        if (token.length > 16_384 || token.split('.').length !== 3) throw new OtpDeliveryError(true, 'metadata')
        let claims: any
        try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) } catch { throw new OtpDeliveryError(true, 'metadata') }
        // This check is defense in depth; STS validates the JWT signature and IAM trust.
        if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)
          || claims.aud !== config.audience || claims.sub !== config.googleSubject
          || claims.azp !== config.googleSubject || !Number.isFinite(claims.exp)
          || claims.exp * 1000 <= now() + 30_000) throw new OtpDeliveryError(true, 'metadata')
        stage = 'federation'
        const result = await assumeRole({ RoleArn: config.roleArn, RoleSessionName: 'majstorsada-otp', WebIdentityToken: token, DurationSeconds: 900 })
        const values = result.Credentials, expiration = values?.Expiration instanceof Date ? values.Expiration : new Date(values?.Expiration || 0)
        if (!values?.AccessKeyId || !values?.SecretAccessKey || !values?.SessionToken || !Number.isFinite(expiration.getTime()) || expiration.getTime() <= now() + 120_000) throw new OtpDeliveryError(true, 'federation')
        cached = { accessKeyId: values.AccessKeyId, secretAccessKey: values.SecretAccessKey, sessionToken: values.SessionToken, expiration }
        return cached
      } catch {
        // The stage is set by this control flow; no provider fields survive.
        throw new OtpDeliveryError(true, stage)
      }
    })()
    try { return await refreshing } finally { refreshing = undefined }
  }
}

export function otpEmailContent(code: string) {
  if (!/^\d{6}$/.test(code)) throw new OtpDeliveryError(true)
  const text = `Vaš kod za prijavu na MajstorSada je: ${code}\n\nKod važi 10 minuta. Unesite ga u aplikaciji u kojoj ste započeli prijavu.\nNe delite ovaj kod sa drugima. Ako niste zatražili prijavu, zanemarite ovaj mejl.\n\nMajstorSada — majstorsada.rs`
  const html = `<!doctype html><html lang="sr-Latn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#1f2937"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px"><tr><td style="padding:32px"><p style="margin:0 0 28px;font-size:20px;font-weight:bold;color:#05243a">MajstorSada</p><h1 style="margin:0 0 16px;font-size:24px">Vaš kod za prijavu</h1><p style="line-height:1.6">Unesite ovaj kod u aplikaciji u kojoj ste započeli prijavu.</p><p style="margin:24px 0;padding:20px 12px;background:#f0f7ff;text-align:center;font-size:36px;font-weight:bold;letter-spacing:6px;color:#05243a">${code}</p><p style="line-height:1.6">Kod važi <strong>10 minuta</strong>. Ne delite ga sa drugima.</p><p style="margin-top:28px;font-size:13px;line-height:1.6;color:#6b7280">Ako niste zatražili prijavu, zanemarite ovaj mejl.</p></td></tr></table><p style="font-size:12px;color:#6b7280">majstorsada.rs</p></td></tr></table></body></html>`
  return { text, html }
}

interface SenderConfig extends CredentialConfig {
  credentials?: () => Promise<TemporaryCredentials>
  send?: (input: any, options: { abortSignal: AbortSignal }) => Promise<any>
}
export function createSesOtpSender(config: SenderConfig) {
  if (config.region && config.region !== 'eu-central-1') throw new Error('OTP SES region must be Frankfurt')
  const credentials = config.credentials || createGoogleAwsCredentials(config)
  const ses = new SESv2Client({ region: 'eu-central-1', credentials, maxAttempts: 1,
    requestHandler: { connectionTimeout: 3000, requestTimeout: 10_000 } })
  const send = config.send || ((input, options) => ses.send(new SendEmailCommand(input), options))
  return async (email: string, code: string, dispatchUntil?: number): Promise<{ messageId: string }> => {
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) throw new OtpDeliveryError(true)
    const content = otpEmailContent(code)
    const now = config.now || Date.now
    if (dispatchUntil !== undefined && (!Number.isFinite(dispatchUntil) || now() >= dispatchUntil)) throw new OtpDeliveryError(true)
    // Obtain credentials before dispatch; a federation failure cannot have sent email.
    try { await credentials() } catch (error) {
      const stage = error instanceof OtpDeliveryError && error.stage === 'metadata' ? 'metadata' : 'federation'
      throw new OtpDeliveryError(true, stage)
    }
    // Federation can take time; recheck immediately before the actual SES attempt.
    const remaining = dispatchUntil === undefined ? 10_000 : dispatchUntil - now()
    if (remaining <= 0) throw new OtpDeliveryError(true)
    try {
      const result = await send({ FromEmailAddress: 'MajstorSada <noreply@majstorsada.rs>', FeedbackForwardingEmailAddress: 'aleksa@majstorsada.rs',
        Destination: { ToAddresses: [email] }, Content: { Simple: { Subject: { Charset: 'UTF-8', Data: 'Vaš kod za prijavu — MajstorSada' },
          Body: { Text: { Charset: 'UTF-8', Data: content.text }, Html: { Charset: 'UTF-8', Data: content.html } } } } }, { abortSignal: AbortSignal.timeout(Math.max(1, Math.floor(Math.min(10_000, remaining)))) })
      if (typeof result.MessageId !== 'string' || !result.MessageId) throw new OtpDeliveryError(false, 'ses')
      return { messageId: result.MessageId }
    } catch (error: any) {
      if (error instanceof OtpDeliveryError) throw new OtpDeliveryError(error.definitive, 'ses')
      const rejected = new Set(['AccountSuspendedException', 'BadRequestException', 'LimitExceededException', 'MailFromDomainNotVerifiedException', 'MessageRejected', 'NotFoundException', 'SendingPausedException', 'TooManyRequestsException', 'AccessDeniedException'])
      throw new OtpDeliveryError(rejected.has(error?.name) && [400, 403, 404, 429].includes(error?.$metadata?.httpStatusCode), 'ses')
    }
  }
}
