'use client'

/**
 * «Para qué se usa cada premio» — los selectores que antes vivían en Ajustes (S-1, 2026-10-13).
 *
 * Cada uno elige un premio del catálogo de la marca (justo debajo, en la misma pestaña) y lo
 * guarda por `PUT /api/dashboard/settings`, que ya tiene lista cerrada y alcance de marca:
 *
 *   · Regalo fuerte   → `aggressive_reward_id` + `aggressive_reward_window_days`. Es el de la
 *     reactivación insistente de siempre Y el del rescate del ciclo de recuperación: el ciclo lo
 *     lee con `normalizeCycleSettings()` cuando `cycle_strong_reward_id` está vacío, así que es
 *     UNA sola elección para los dos caminos. Lleva también el recordatorio de vencimiento
 *     (`reward_reminder_*`), que estaba dentro del mismo bloque de Ajustes.
 *   · Regalo pequeño  → `cycle_small_reward_ids` (el primero). Lo usa el ciclo cuando se encienda.
 *   · Premio por reseña → `review_reward_id` + `review_reward_window_days`.
 *
 * La lógica (qué dice un selector cuyo premio ya no está activo, cómo se reescribe la lista del
 * regalo pequeño, cómo se dice cuánto dura) vive PURA en `src/lib/premios-para-regalar.ts`.
 * Doc: docs/features/reward-grants.md § «Dónde vive cada premio».
 */

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, Loader2 } from 'lucide-react'
import type { CampaignReward } from '@/types/database.types'
import {
  AVISO_PREMIO_NO_DISPONIBLE,
  cicloTieneFuerteAparte,
  conPrimerRegaloPequeno,
  estadoDelSelector,
  idsDeLista,
  textoDeVigencia,
  ventanaEnDias,
} from '@/lib/premios-para-regalar'

interface Props {
  /** El catálogo COMPLETO de la marca (activos y retirados): un retirado se detecta, no se oculta. */
  rewards: CampaignReward[]
  /** Todo `admin_settings` de la marca, tal como lo devolvió el GET. */
  ajustes: Record<string, string>
  /** Un administrador de sede ve lo elegido pero no lo cambia (el PUT responde 403). */
  soloLectura: boolean
}

async function saveSetting(key: string, value: string) {
  const res = await fetch('/api/dashboard/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data?.error === 'string' ? data.error : 'Error guardando')
  }
}

const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50 disabled:opacity-60'

/**
 * El desplegable de un premio, con el aviso cuando lo guardado ya no sirve. Exportado: lo reusa
 * Recompensas › Referidos (2026-10-15) para el premio de quien invita y el del amigo.
 */
export function SelectorDePremio(props: {
  id: string
  etiqueta: string
  value: string
  onChange: (id: string) => void
  rewards: CampaignReward[]
  sinPremio: string
  disabled: boolean
}) {
  const { id, etiqueta, value, onChange, rewards, sinPremio, disabled } = props
  const estado = estadoDelSelector(value, rewards)
  const activos = rewards.filter((r) => r.is_active)
  // Lo guardado que ya no sirve se MUESTRA (con su nombre si el catálogo todavía lo tiene) en vez
  // de dejar el desplegable en «sin premio»: vacío querría decir «no hay premio», y sí hay uno.
  const retirado = estado.tipo === 'no_disponible' ? rewards.find((r) => r.id === estado.id) : undefined

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={SELECT_CLASS}
      >
        <option value="">{sinPremio}</option>
        {estado.tipo === 'no_disponible' && (
          <option value={estado.id}>{retirado ? `${retirado.title} (retirado)` : 'Premio que ya no está en el catálogo'}</option>
        )}
        {activos.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
          </option>
        ))}
      </select>
      {estado.tipo === 'no_disponible' && (
        <p className="text-xs font-medium text-destructive">{AVISO_PREMIO_NO_DISPONIBLE}</p>
      )}
    </div>
  )
}

/** Una tarjeta del bloque: título, ayuda, sus campos y SU botón de guardar. */
function Fila(props: {
  titulo: string
  ayuda: string
  children: ReactNode
  error: string | null
  guardando: boolean
  guardado: boolean
  onGuardar: () => void
  soloLectura: boolean
}) {
  const { titulo, ayuda, children, error, guardando, guardado, onGuardar, soloLectura } = props
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        {!soloLectura && (
          <Button onClick={onGuardar} disabled={guardando} className="gap-2">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {guardado ? 'Guardado' : 'Guardar'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function RewardUsageSelectors({ rewards, ajustes, soloLectura }: Props) {
  const cicloEncendido = ajustes.cycle_enabled?.trim() === 'true'
  const fuerteAparte = cicloTieneFuerteAparte(ajustes)

  // ── Regalo fuerte (+ recordatorio de vencimiento) ──
  const [fuerteId, setFuerteId] = useState(ajustes.aggressive_reward_id ?? '')
  const [fuerteDias, setFuerteDias] = useState(ajustes.aggressive_reward_window_days || '7')
  const [avisoActivo, setAvisoActivo] = useState(ajustes.reward_reminder_enabled === 'true')
  const [avisoDias, setAvisoDias] = useState(ajustes.reward_reminder_days_before || '2')
  const [fuerteGuardando, setFuerteGuardando] = useState(false)
  const [fuerteGuardado, setFuerteGuardado] = useState(false)
  const [fuerteError, setFuerteError] = useState<string | null>(null)

  // ── Regalo pequeño ──
  const [pequenoId, setPequenoId] = useState(idsDeLista(ajustes.cycle_small_reward_ids)[0] ?? '')
  const [pequenoGuardando, setPequenoGuardando] = useState(false)
  const [pequenoGuardado, setPequenoGuardado] = useState(false)
  const [pequenoError, setPequenoError] = useState<string | null>(null)

  // ── Premio por reseña ──
  const [resenaId, setResenaId] = useState(ajustes.review_reward_id ?? '')
  const [resenaDias, setResenaDias] = useState(ajustes.review_reward_window_days || '30')
  const [resenaGuardando, setResenaGuardando] = useState(false)
  const [resenaGuardado, setResenaGuardado] = useState(false)
  const [resenaError, setResenaError] = useState<string | null>(null)

  const marcarGuardado = (poner: (v: boolean) => void) => {
    poner(true)
    setTimeout(() => poner(false), 3000)
  }

  const guardarFuerte = async () => {
    const ventana = ventanaEnDias(fuerteDias)
    const antes = ventanaEnDias(avisoDias)
    setFuerteError(null)
    if (ventana === null) {
      setFuerteError('La ventana del premio debe ser un número mayor a 0.')
      return
    }
    if (avisoActivo) {
      if (antes === null) {
        setFuerteError('Los días de aviso deben ser un número mayor a 0.')
        return
      }
      if (antes >= ventana) {
        setFuerteError('El aviso debe salir ANTES de que venza el premio: los días de aviso tienen que ser menores que la ventana.')
        return
      }
      if (!ajustes.reward_reminder_template_sid) {
        setFuerteError('Primero activa el mensaje «Recordatorio de premio» en Plantillas: sin él, el recordatorio no puede salir.')
        return
      }
    }
    setFuerteGuardando(true)
    setFuerteGuardado(false)
    try {
      await Promise.all([
        saveSetting('aggressive_reward_id', fuerteId),
        saveSetting('aggressive_reward_window_days', String(ventana)),
        saveSetting('reward_reminder_enabled', String(avisoActivo)),
        // Con el aviso apagado los días no se tocan: el campo ni se ve y `NaN` no es un valor.
        ...(antes === null ? [] : [saveSetting('reward_reminder_days_before', String(antes))]),
      ])
      marcarGuardado(setFuerteGuardado)
    } catch (err) {
      setFuerteError(err instanceof Error ? err.message : 'Error guardando')
    } finally {
      setFuerteGuardando(false)
    }
  }

  const guardarPequeno = async () => {
    setPequenoError(null)
    setPequenoGuardando(true)
    setPequenoGuardado(false)
    try {
      await saveSetting('cycle_small_reward_ids', conPrimerRegaloPequeno(ajustes.cycle_small_reward_ids, pequenoId))
      marcarGuardado(setPequenoGuardado)
    } catch (err) {
      setPequenoError(err instanceof Error ? err.message : 'Error guardando')
    } finally {
      setPequenoGuardando(false)
    }
  }

  const guardarResena = async () => {
    const ventana = ventanaEnDias(resenaDias)
    setResenaError(null)
    if (ventana === null) {
      setResenaError('La ventana del premio debe ser un número mayor a 0.')
      return
    }
    setResenaGuardando(true)
    setResenaGuardado(false)
    try {
      await Promise.all([
        saveSetting('review_reward_id', resenaId),
        saveSetting('review_reward_window_days', String(ventana)),
      ])
      marcarGuardado(setResenaGuardado)
    } catch (err) {
      setResenaError(err instanceof Error ? err.message : 'Error guardando')
    } finally {
      setResenaGuardando(false)
    }
  }

  const ventanaFuerte = ventanaEnDias(fuerteDias)
  const ventanaResena = ventanaEnDias(resenaDias)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Para qué se usa cada premio</h2>
        <p className="text-sm text-muted-foreground">
          Elige del catálogo de más abajo qué premio regala cada mensaje. Si aún no tienes el premio, créalo
          allí y vuelve.
        </p>
        {soloLectura && (
          <p className="mt-2 rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
            Estos premios son de la marca: los ves aquí, pero solo un super usuario puede cambiarlos.
          </p>
        )}
      </div>

      <Fila
        titulo="Regalo fuerte"
        ayuda={`El que recibe quien lleva tiempo sin venir.${
          ventanaFuerte !== null ? ` Hoy ${textoDeVigencia({ dias: ventanaFuerte })}.` : ''
        }`}
        error={fuerteError}
        guardando={fuerteGuardando}
        guardado={fuerteGuardado}
        onGuardar={guardarFuerte}
        soloLectura={soloLectura}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <SelectorDePremio
              id="premio-fuerte"
              etiqueta="Premio a regalar"
              value={fuerteId}
              onChange={setFuerteId}
              rewards={rewards}
              sinPremio="— Sin premio (solo mensaje) —"
              disabled={soloLectura}
            />
            <p className="text-[11px] text-muted-foreground">
              Sin premio, el mensaje sigue saliendo y es solo un recordatorio.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="premio-fuerte-dias" className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Ventana del premio (días)
            </Label>
            <Input
              id="premio-fuerte-dias"
              type="number"
              min={1}
              value={fuerteDias}
              onChange={(e) => setFuerteDias(e.target.value)}
              disabled={soloLectura}
              placeholder="7"
              className="h-9"
            />
            <p className="text-[11px] text-muted-foreground">
              Cuánto tiempo tiene el cliente para venir a reclamarlo. Es independiente de los días de
              reactivación.
            </p>
          </div>
        </div>

        {cicloEncendido && (
          <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
            Tu marca tiene el ciclo de recuperación encendido: este mismo regalo es el del rescate y{' '}
            <strong>{textoDeVigencia('domingo')}</strong> de la semana en que se envía. Los días de arriba solo
            cuentan para la reactivación de siempre.
          </p>
        )}
        {fuerteAparte && (
          <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
            El ciclo de recuperación tiene un regalo fuerte propio, puesto aparte: este selector solo cambia el
            de la reactivación de siempre.
          </p>
        )}

        <div className="border-t pt-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={avisoActivo}
              onChange={(e) => setAvisoActivo(e.target.checked)}
              disabled={soloLectura}
              className="mt-0.5 h-4 w-4 rounded"
            />
            <div>
              <p className="text-sm font-semibold">Recordarle antes de que venza</p>
              <p className="text-[11px] text-muted-foreground">
                Un solo mensaje, solo a quien no ha vuelto. Cuenta contra el límite de 3 mensajes de marketing al
                mes por cliente.
              </p>
            </div>
          </label>

          {avisoActivo && (
            <div className="mt-3 max-w-[220px] space-y-1">
              <Label htmlFor="premio-aviso-dias" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Días antes de vencer
              </Label>
              <Input
                id="premio-aviso-dias"
                type="number"
                min={1}
                value={avisoDias}
                onChange={(e) => setAvisoDias(e.target.value)}
                disabled={soloLectura}
                placeholder="2"
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Debe ser menor que la ventana. Con ventana de 7 y aviso de 2, el mensaje sale el día 5. El mensaje
                se elige en <Link href="/dashboard/templates" className="underline">Plantillas</Link>.
              </p>
            </div>
          )}
        </div>
      </Fila>

      <Fila
        titulo="Regalo pequeño"
        ayuda={`El del mensaje «Le regalamos algo». Lo usa el ciclo de recuperación cuando se encienda en tu marca; ${textoDeVigencia('domingo')}, sin recordatorio.`}
        error={pequenoError}
        guardando={pequenoGuardando}
        guardado={pequenoGuardado}
        onGuardar={guardarPequeno}
        soloLectura={soloLectura}
      >
        <div className="max-w-md">
          <SelectorDePremio
            id="premio-pequeno"
            etiqueta="Premio a regalar"
            value={pequenoId}
            onChange={setPequenoId}
            rewards={rewards}
            sinPremio="— Sin regalo pequeño (el mensaje sale sin regalo) —"
            disabled={soloLectura}
          />
        </div>
      </Fila>

      <Fila
        titulo="Premio por reseña"
        ayuda={`El que gana el cliente que deja su reseña en Google.${
          ventanaResena !== null ? ` Hoy ${textoDeVigencia({ dias: ventanaResena })}.` : ''
        }`}
        error={resenaError}
        guardando={resenaGuardando}
        guardado={resenaGuardado}
        onGuardar={guardarResena}
        soloLectura={soloLectura}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <SelectorDePremio
              id="premio-resena"
              etiqueta="Recompensa por reseña"
              value={resenaId}
              onChange={setResenaId}
              rewards={rewards}
              sinPremio="— Sin premio (solo se pide el favor) —"
              disabled={soloLectura}
            />
            <p className="text-[11px] text-muted-foreground">
              El mesero lo entrega desde <em>Premios pendientes</em>, igual que todos los demás. El link de
              reseñas sigue en Ajustes.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="premio-resena-dias" className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Ventana del premio (días)
            </Label>
            <Input
              id="premio-resena-dias"
              type="number"
              min={1}
              value={resenaDias}
              onChange={(e) => setResenaDias(e.target.value)}
              disabled={soloLectura}
              placeholder="30"
              className="h-9"
            />
            <p className="text-[11px] text-muted-foreground">
              Lo normal es que lo reclame en la misma visita. Default: 30 días.
            </p>
          </div>
        </div>
      </Fila>
    </div>
  )
}
