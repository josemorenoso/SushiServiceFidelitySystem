/**
 * La importación de clientes por CSV de Clientes, fila por fila (0.ETA, 2026-10-15).
 *
 * Contaba como «importado» todo cliente cuyo registro se había INTENTADO: no miraba `res.ok`
 * de `POST /api/check-in`. Con 2+ sedes el registro desde el dominio de la marca contesta 409
 * (D21) y la importación reportaba éxito sobre cero filas; igual con un 500. Y un fallo de la
 * consulta previa («¿ya existe?») se leía como «no existe».
 *
 * Se usa desde el navegador (`dashboard/customers/page.tsx`); `fetch` entra por parámetro para
 * que se pruebe sin red. No cambia QUÉ se manda (N1, el consentimiento, es otra decisión).
 */

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export type ResultadoDeFila =
  | { tipo: 'importado' }
  | { tipo: 'ya-existia' }
  | { tipo: 'fallo'; motivo: string }

const SIN_MOTIVO = 'el servidor no contestó'

async function motivoDe(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: unknown; message?: unknown }
  if (typeof data.message === 'string' && data.message) return data.message
  if (typeof data.error === 'string' && data.error) return data.error
  return `error ${res.status}`
}

/** Registra UN cliente si no existe. Solo devuelve «importado» si la base lo aceptó. */
export async function importarCliente(phone: string, name: string, fetchImpl: Fetch = fetch): Promise<ResultadoDeFila> {
  try {
    const consulta = await fetchImpl('/api/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, action: 'lookup' }),
    })
    if (!consulta.ok) return { tipo: 'fallo', motivo: await motivoDe(consulta) }
    const encontrado = (await consulta.json().catch(() => null)) as { found?: unknown } | null
    if (!encontrado) return { tipo: 'fallo', motivo: SIN_MOTIVO }
    if (encontrado.found) return { tipo: 'ya-existia' }

    const registro = await fetchImpl('/api/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, action: 'register', name, accepts_marketing: true }),
    })
    if (!registro.ok) return { tipo: 'fallo', motivo: await motivoDe(registro) }
    return { tipo: 'importado' }
  } catch {
    return { tipo: 'fallo', motivo: SIN_MOTIVO }
  }
}

export interface ResumenDeImportacion {
  importados: number
  yaExistian: number
  invalidos: number
  fallidos: number
  /** El motivo del primer fallo, tal como lo dijo el servidor. */
  primerMotivo: string | null
}

export function resumenVacio(): ResumenDeImportacion {
  return { importados: 0, yaExistian: 0, invalidos: 0, fallidos: 0, primerMotivo: null }
}

export function sumarFila(r: ResumenDeImportacion, fila: ResultadoDeFila): ResumenDeImportacion {
  if (fila.tipo === 'importado') return { ...r, importados: r.importados + 1 }
  if (fila.tipo === 'ya-existia') return { ...r, yaExistian: r.yaExistian + 1 }
  return { ...r, fallidos: r.fallidos + 1, primerMotivo: r.primerMotivo ?? fila.motivo }
}

/** Lo que dice la pantalla. Un fallo nunca sale como éxito, ni mezclado con «omitidos». */
export function textoDelResumen(r: ResumenDeImportacion): { tipo: 'exito' | 'error'; texto: string } {
  const partes = [`Importados: ${r.importados}`, `ya existían: ${r.yaExistian}`, `inválidos: ${r.invalidos}`]
  if (r.fallidos === 0) return { tipo: 'exito', texto: partes.join(' · ') }
  return {
    tipo: 'error',
    texto: `${partes.join(' · ')} · NO se importaron: ${r.fallidos} (${r.primerMotivo ?? SIN_MOTIVO}).`,
  }
}
