export const SUPPORTED_CITIES = ['Beograd'] as const

export type SupportedCity = (typeof SUPPORTED_CITIES)[number]

export const DEFAULT_CITY: SupportedCity = 'Beograd'

export function isSupportedCity(value: unknown): value is SupportedCity {
  return typeof value === 'string' && (SUPPORTED_CITIES as readonly string[]).includes(value)
}

export function normalizeCity(value: unknown): SupportedCity | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return isSupportedCity(v) ? v : null
}


