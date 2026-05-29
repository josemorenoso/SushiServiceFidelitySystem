/**
 * Wrapper promisificado de navigator.geolocation.getCurrentPosition.
 */
export function getCurrentPosition(
  timeoutMs = 10000
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalización no soportada'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Permiso de ubicación denegado'))
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new Error('Ubicación no disponible'))
        } else if (err.code === err.TIMEOUT) {
          reject(new Error('Tiempo de espera agotado'))
        } else {
          reject(new Error(err.message || 'Error de geolocalización'))
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    )
  })
}

/**
 * Calcula la distancia en metros entre dos puntos geográficos
 * usando la fórmula de Haversine.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3 // Radio de la Tierra en metros
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}
