// Leave a minute of the existing 300-second scheduler timeout for an in-flight
// cleanup RPC. The deadline stops starting further work; it cannot cancel an RPC.
export const OTP_MAINTENANCE_BUDGET_MS = 240_000

export async function runScheduledMaintenance<JobReport, OtpReport>({
  runJobs, runOtp, logJobs, logOtp, logOtpFailure, now = Date.now,
}: {
  runJobs: () => Promise<JobReport>
  runOtp: (deadline: number) => Promise<OtpReport>
  logJobs: (report: JobReport) => void
  logOtp: (report: OtpReport) => void
  logOtpFailure: () => void
  now?: () => number
}): Promise<void> {
  const otpDeadline = now() + OTP_MAINTENANCE_BUDGET_MS
  // Business failures and their logging retain the original scheduler semantics.
  const jobs = await runJobs()
  logJobs(jobs)
  try {
    logOtp(await runOtp(otpDeadline))
  } catch {
    // Auxiliary cleanup or its reporting cannot turn a completed business pass
    // into a failed invocation. Retained records are eligible on the next pass.
    try { logOtpFailure() } catch {}
  }
}
