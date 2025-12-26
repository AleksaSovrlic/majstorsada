export const BELGRADE_BBOX = {
  // minLon, minLat, maxLon, maxLat (Mapbox bbox order)
  minLng: 19.99,
  minLat: 44.60,
  maxLng: 20.78,
  maxLat: 45.00
} as const

export const BELGRADE_BBOX_PARAM = `${BELGRADE_BBOX.minLng},${BELGRADE_BBOX.minLat},${BELGRADE_BBOX.maxLng},${BELGRADE_BBOX.maxLat}`

export function isWithinBelgradeBbox(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return (
    lat >= BELGRADE_BBOX.minLat &&
    lat <= BELGRADE_BBOX.maxLat &&
    lng >= BELGRADE_BBOX.minLng &&
    lng <= BELGRADE_BBOX.maxLng
  )
}


