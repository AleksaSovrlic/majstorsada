export function timestampCacheKey(ts: any): string {
  try {
    if (ts && typeof ts.toMillis === 'function') return String(ts.toMillis())
    if (ts && typeof ts.seconds === 'number') return String(ts.seconds)
  } catch {
    // ignore
  }
  return ''
}


