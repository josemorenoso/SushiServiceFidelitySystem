/**
 * Calcula distancia en metros entre dos coordenadas (Haversine).
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function getCurrentPosition(timeoutMs = 10000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Tu navegador no soporta geolocalización'))
      return
    }
    const timer = setTimeout(() => reject(new Error('Tiempo agotado obteniendo ubicación')), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); resolve(pos) },
      (err) => {
        clearTimeout(timer)
        const msgs: Record<number, string> = {
          1: 'Permiso de ubicación denegado. Activa la ubicación para hacer check-in.',
          2: 'No se pudo obtener tu ubicación. Verifica que el GPS esté activado.',
          3: 'Tiempo agotado obteniendo ubicación.',
        }
        reject(new Error(msgs[err.code] ?? 'Error obteniendo ubicación'))
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    )
  })
}
