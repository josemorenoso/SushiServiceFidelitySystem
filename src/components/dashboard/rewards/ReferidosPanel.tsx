'use client'

/**
 * Recompensas › Referidos (2026-10-15). Doc: docs/features/referral-program.md
 *
 * Un cliente comparte su enlace por SU WhatsApp; cuando el amigo viene y el mesero lo escanea, los
 * dos ganan. Acá el dueño lo enciende, elige qué gana cada uno (un premio del catálogo de Premios
 * para regalar, puntos, o nada), el tope al mes, los días para venir y el texto que se comparte; y
 * ve los números: cuántos se registraron, cuántos vinieron, los premios y quiénes traen más.
 * Conteos, NUNCA pesos.
 *
 * Una lectura que FALLA se dice: nunca «0 referidos» ni «apagado» por un fallo de base. Un
 * administrador de sede lo ve todo y no cambia nada (la ruta responde 403 de todos modos).
 * Celular primero: una columna, y las cifras en dos.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Check, Gift, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { CampaignReward } from '@/types/database.types'
import { SelectorDePremio } from '@/components/dashboard/RewardUsageSelectors'
import {
  LIMITES,
  MENSAJE_DEFAULT,
  mensajeParaCompartir,
  textoDelBeneficio,
  type AjustesDeReferidos,
  type PremioDeReferido,
  type TipoDePremio,
} from '@/lib/referidos'

interface Numeros {
  registrados: number
  vinieron: number
  pendientes: number
  vencidos: number
  premiosGanados: number
  premiosEntregados: number
  regalosEntregados: number
  top: Array<{ nombre: string; vinieron: number; registrados: number }>
}

const TIPOS: Array<{ id: TipoDePremio; etiqueta: string }> = [
  { id: 'reward', etiqueta: 'Premio del catálogo' },
  { id: 'points', etiqueta: 'Puntos' },
  { id: 'none', etiqueta: 'Nada' },
]

/** Lo que edita la pantalla: los números como texto (un input vacío no es 0). */
interface Borrador {
  enabled: boolean
  quien: { tipo: TipoDePremio; rewardId: string; puntos: string }
  amigo: { tipo: TipoDePremio; rewardId: string; puntos: string }
  tope: string
  dias: string
  mensaje: string
}

function aBorrador(a: AjustesDeReferidos): Borrador {
  const p = (x: PremioDeReferido) => ({ tipo: x.tipo, rewardId: x.rewardId ?? '', puntos: x.puntos != null ? String(x.puntos) : '' })
  return {
    enabled: a.enabled,
    quien: p(a.premioDeQuienInvita),
    amigo: p(a.premioDelAmigo),
    tope: String(a.topeAlMes),
    dias: String(a.diasDeVencimiento),
    mensaje: a.mensaje,
  }
}

function premioParaEnviar(p: Borrador['quien']) {
  if (p.tipo === 'reward') return { tipo: 'reward', rewardId: p.rewardId }
  if (p.tipo === 'points') return { tipo: 'points', puntos: Number(p.puntos) }
  return { tipo: 'none' }
}

function Cifra({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-2xl font-bold tabular-nums">{valor.toLocaleString('es-CO')}</p>
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
    </div>
  )
}

function EleccionDePremio(props: {
  id: string
  titulo: string
  ayuda: string
  valor: Borrador['quien']
  onChange: (v: Borrador['quien']) => void
  catalogo: CampaignReward[]
  soloLectura: boolean
  puntosEncendidos: boolean
}) {
  const { id, titulo, ayuda, valor, onChange, catalogo, soloLectura, puntosEncendidos } = props
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={titulo}>
          {TIPOS.map((t) => (
            <Button
              key={t.id}
              type="button"
              size="sm"
              variant={valor.tipo === t.id ? 'default' : 'outline'}
              aria-pressed={valor.tipo === t.id}
              disabled={soloLectura}
              onClick={() => onChange({ ...valor, tipo: t.id })}
            >
              {t.etiqueta}
            </Button>
          ))}
        </div>
        {valor.tipo === 'reward' && (
          <SelectorDePremio
            id={`${id}-premio`}
            etiqueta="Premio"
            value={valor.rewardId}
            onChange={(rewardId) => onChange({ ...valor, rewardId })}
            rewards={catalogo}
            sinPremio="Elige un premio…"
            disabled={soloLectura}
          />
        )}
        {valor.tipo === 'points' && (
          <div className="space-y-1">
            <Label htmlFor={`${id}-puntos`} className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Puntos
            </Label>
            <Input
              id={`${id}-puntos`}
              inputMode="numeric"
              value={valor.puntos}
              onChange={(e) => onChange({ ...valor, puntos: e.target.value.replace(/\D/g, '').slice(0, 5) })}
              disabled={soloLectura}
              className="max-w-[10rem]"
            />
            {!puntosEncendidos && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                El sistema de puntos está apagado en Ajustes: mientras siga así, estos puntos no se suman.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ReferidosPanel({ irAPremios }: { irAPremios?: () => void } = {}) {
  const [cargando, setCargando] = useState(true)
  const [errorDeLectura, setErrorDeLectura] = useState<string | null>(null)
  const [numeros, setNumeros] = useState<Numeros | null>(null)
  const [puntosEncendidos, setPuntosEncendidos] = useState(true)
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [catalogo, setCatalogo] = useState<CampaignReward[] | null>(null)
  const [soloLectura, setSoloLectura] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorAlGuardar, setErrorAlGuardar] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/referrals')
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        ajustes?: AjustesDeReferidos
        numeros?: Numeros
        puntos_encendidos?: boolean
      }
      if (!res.ok || !data.ajustes || !data.numeros) {
        setErrorDeLectura(data.error ?? 'No pudimos leer los referidos de tu marca. Recarga la página.')
        return
      }
      setBorrador(aBorrador(data.ajustes))
      setNumeros(data.numeros)
      setPuntosEncendidos(data.puntos_encendidos !== false)
      setErrorDeLectura(null)
    } catch {
      setErrorDeLectura('No pudimos leer los referidos de tu marca. Revisa tu conexión y recarga la página.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    // El catálogo COMPLETO (activos y retirados): un premio retirado se dice, no se esconde.
    fetch('/api/dashboard/campaign-rewards')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data: unknown = await r.json()
        if (!Array.isArray(data)) throw new Error('respuesta inesperada')
        setCatalogo(data as CampaignReward[])
      })
      .catch(() => setCatalogo(null))
    fetch('/api/dashboard/locations')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.role === 'location') setSoloLectura(true)
      })
      .catch(() => {
        /* sin la respuesta, la pantalla se comporta como siempre: la ruta decide */
      })
  }, [])

  const vistaPrevia = useMemo(() => {
    if (!borrador) return ''
    const titulo = catalogo?.find((r) => r.id === borrador.amigo.rewardId)?.title ?? null
    const beneficio = textoDelBeneficio(
      {
        tipo: borrador.amigo.tipo,
        rewardId: borrador.amigo.rewardId || null,
        puntos: Number(borrador.amigo.puntos) || null,
      },
      titulo
    )
    return mensajeParaCompartir(borrador.mensaje.trim() || MENSAJE_DEFAULT, {
      nombre: 'Ana',
      beneficio,
      marca: 'tu restaurante',
      enlace: 'https://…/r/AB3K9Q',
    })
  }, [borrador, catalogo])

  const guardar = async () => {
    if (!borrador) return
    setGuardando(true)
    setErrorAlGuardar(null)
    try {
      const res = await fetch('/api/dashboard/referrals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: borrador.enabled,
          premioDeQuienInvita: premioParaEnviar(borrador.quien),
          premioDelAmigo: premioParaEnviar(borrador.amigo),
          topeAlMes: Number(borrador.tope),
          diasDeVencimiento: Number(borrador.dias),
          mensaje: borrador.mensaje,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; ajustes?: AjustesDeReferidos }
      if (!res.ok || !data.ajustes) {
        setErrorAlGuardar(data.error ?? 'No pudimos guardar. Intenta de nuevo.')
        return
      }
      setBorrador(aBorrador(data.ajustes))
      toast.success(data.ajustes.enabled ? 'Referidos guardados y encendidos' : 'Referidos guardados (apagados)')
    } catch {
      setErrorAlGuardar('Error de conexión. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (errorDeLectura || !borrador || !numeros) {
    return (
      <p className="rounded-lg border border-destructive/40 p-4 text-sm font-medium text-destructive">
        {errorDeLectura ?? 'No pudimos leer los referidos de tu marca.'} No quiere decir que estén apagados ni que no
        haya ninguno: por eso no se muestran.
      </p>
    )
  }

  const catalogoVacio = catalogo !== null && catalogo.filter((r) => r.is_active).length === 0
  const set = (cambio: Partial<Borrador>) => setBorrador({ ...borrador, ...cambio })

  return (
    <div className="space-y-6">
      {/* ── Encendido y qué es ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-4 w-4" /> Trae a un amigo: los dos ganan
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Tus clientes ven en su tarjeta «🎁 Gánate … por traer a un amigo» y comparten su enlace por su propio WhatsApp
            (no gasta mensajes de tu línea). El amigo se registra con ese enlace y su regalo queda en su tarjeta. Cuando
            viene y el mesero lo escanea, quien lo invitó gana su premio. Sirve en todas tus sedes.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={borrador.enabled}
              disabled={soloLectura}
              onChange={(e) => set({ enabled: e.target.checked })}
            />
            {borrador.enabled ? 'Encendido' : 'Apagado'}
          </label>
          {soloLectura && (
            <p className="text-xs text-muted-foreground">Los referidos son de la marca: solo un super usuario los cambia.</p>
          )}
          {catalogo === null && (
            <p className="text-xs font-medium text-destructive">
              No se pudo leer el catálogo de premios: puedes elegir puntos, o recargar la página.
            </p>
          )}
          {catalogoVacio && (
            <p className="text-xs text-muted-foreground">
              Tu catálogo de premios está vacío.{' '}
              {irAPremios ? (
                <button type="button" className="underline" onClick={irAPremios}>
                  Crea uno en Premios para regalar
                </button>
              ) : (
                'Crea uno en Premios para regalar'
              )}{' '}
              o elige puntos.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Los números ── */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="h-5 w-5" /> Cómo va
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra valor={numeros.registrados} etiqueta="Amigos que se registraron" />
          <Cifra valor={numeros.vinieron} etiqueta="Vinieron (los escaneó el mesero)" />
          <Cifra valor={numeros.pendientes} etiqueta="Todavía no vienen" />
          <Cifra valor={numeros.vencidos} etiqueta="Vencieron sin venir" />
          <Cifra valor={numeros.premiosGanados} etiqueta="Premios que ganó quien invitó" />
          <Cifra valor={numeros.premiosEntregados} etiqueta="De esos, ya entregados" />
          <Cifra valor={numeros.regalosEntregados} etiqueta="Regalos de bienvenida entregados" />
        </div>
        {numeros.top.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Los que más traen</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-1.5 text-sm">
                {numeros.top.map((t, i) => (
                  <li key={`${t.nombre}-${i}`} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {i + 1}. {t.nombre}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {t.vinieron} vinieron · {t.registrados} se registraron
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Qué gana cada uno ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <EleccionDePremio
          id="ref-quien"
          titulo="Qué gana quien invita"
          ayuda="Se lo gana cuando su amigo VIENE y el mesero lo escanea, nunca al registrarse. Un premio del catálogo queda en su tarjeta para reclamarlo; los puntos se suman solos."
          valor={borrador.quien}
          onChange={(quien) => set({ quien })}
          catalogo={catalogo ?? []}
          soloLectura={soloLectura}
          puntosEncendidos={puntosEncendidos}
        />
        <EleccionDePremio
          id="ref-amigo"
          titulo="Qué gana el amigo"
          ayuda="Su regalo de bienvenida. Un premio del catálogo aparece en su tarjeta desde que se registra y se le entrega en su primera visita; los puntos se le suman en esa visita."
          valor={borrador.amigo}
          onChange={(amigo) => set({ amigo })}
          catalogo={catalogo ?? []}
          soloLectura={soloLectura}
          puntosEncendidos={puntosEncendidos}
        />
      </div>

      {/* ── Reglas ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reglas</CardTitle>
          <p className="text-xs text-muted-foreground">
            Un teléfono se refiere una sola vez; quien ya es tu cliente no cuenta; nadie se refiere a sí mismo.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ref-tope" className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Premios por cliente al mes
            </Label>
            <Input
              id="ref-tope"
              inputMode="numeric"
              value={borrador.tope}
              onChange={(e) => set({ tope: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              disabled={soloLectura}
              className="max-w-[10rem]"
            />
            <p className="text-xs text-muted-foreground">
              Pasado el tope, sus amigos igual reciben su regalo; él no gana más ese mes ({LIMITES.topeAlMes.min}–
              {LIMITES.topeAlMes.max}).
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ref-dias" className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Días para venir
            </Label>
            <Input
              id="ref-dias"
              inputMode="numeric"
              value={borrador.dias}
              onChange={(e) => set({ dias: e.target.value.replace(/\D/g, '').slice(0, 3) })}
              disabled={soloLectura}
              className="max-w-[10rem]"
            />
            <p className="text-xs text-muted-foreground">
              Si el amigo no viene en estos días, el referido vence y nadie gana. Es también lo que dura cada premio para
              reclamarlo.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── El mensaje ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">El mensaje para compartir</CardTitle>
          <p className="text-xs text-muted-foreground">
            Sale del WhatsApp de tu cliente, con su enlace. Usa {'{nombre}'} (quien invita), {'{beneficio}'} (el regalo del
            amigo), {'{marca}'} y {'{enlace}'}. Si borras {'{enlace}'}, se agrega al final.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            aria-label="Mensaje para compartir"
            value={borrador.mensaje}
            maxLength={LIMITES.mensaje}
            rows={4}
            disabled={soloLectura}
            onChange={(e) => set({ mensaje: e.target.value })}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50 disabled:opacity-60"
          />
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Así le llega al amigo</p>
            <p className="whitespace-pre-wrap break-words">{vistaPrevia}</p>
          </div>
        </CardContent>
      </Card>

      {errorAlGuardar && <p className="text-sm font-medium text-destructive">{errorAlGuardar}</p>}
      {!soloLectura && (
        <Button onClick={guardar} disabled={guardando} className="w-full gap-2 sm:w-auto">
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar referidos
        </Button>
      )}
    </div>
  )
}
