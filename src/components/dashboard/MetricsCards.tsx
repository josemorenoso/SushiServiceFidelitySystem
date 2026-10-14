'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Users, ShoppingBag, UserPlus, Star, Cake, QrCode, TrendingUp, Footprints } from 'lucide-react'
import { MiniSparkline } from './MiniSparkline'
import type { AnalyticsSummary } from '@/types/analytics.types'
import { fraseVanAVarias } from '@/lib/panel-sedes'

/**
 * La fila de métricas que abre el panel.
 *
 * CAPA VISUAL v3 (2026-09-07). Hasta hoy eran SIETE tarjetas idénticas: mismo
 * tamaño, mismo borde y siete colores distintos, uno por métrica. Todo pesaba
 * igual, entonces nada pesaba — el dueño abría el panel y no sabía en tres
 * segundos si el día iba bien. Este panel es el argumento de venta del producto:
 * si se ve caro, se cobra más.
 *
 * Qué cambió, y qué NO:
 *
 *   - **Ninguna métrica se fue.** Siguen las siete. El kit visual sugería dejar
 *     "1 héroe + 4 secundarias", pero sacar métricas del panel es una decisión
 *     del dueño, no de quien lo pinta. Lo que cambió es el PESO, no el contenido.
 *   - **Visitas Hoy pasa a ser la tarjeta héroe**: es la única que responde
 *     "¿cómo va hoy?", así que es la única oscura, grande y a doble columna.
 *   - **El arcoíris se fue.** Siete colores decorativos (verde, azul, violeta,
 *     cian, índigo, ámbar, rosa) que no significaban nada: no eran una escala,
 *     no codificaban un estado, solo diferenciaban tarjetas que ya se
 *     diferencian por su título. Ahora el color es de la marca y aparece en un
 *     solo sitio — el héroe (regla 01 del kit: una sola cosa brilla).
 *
 * Los colores salen de las variables del sistema (`--brand-*`), no de hex
 * horneados acá: la regla de §5 vale igual en el panel que en las públicas.
 *
 * SEDES SEPARADAS, PARTE 1 (dueño, 2026-10-14, mirando Tepuy: con Envigado elegido decía
 * «TOTAL CLIENTES 40», y con Laureles también 40). Con una sede elegida (`sede`), `summary`
 * trae lo de ESA sede y cada tarjeta dice de dónde sale su número: las visitas, «en esta
 * sede»; lo de clientes, «se registraron aquí» (`customers.origin_location_id`). Y una franja
 * ancha más: «Vinieron a esta sede», donde quien va a las dos cuenta en las dos. Sin `sede`
 * (marca de una sede, o «toda la marca»), la fila de siempre, sin una letra de cambio.
 */

/** Con una sede elegida: si el recorte son varias sedes (un administrador de varias) y cuántas tiene la marca. */
export interface MetricsCardsSede {
  varias: boolean
  sedesDeLaMarca: number
}

interface MetricsCardsProps {
  summary: AnalyticsSummary | null
  loading: boolean
  sede?: MetricsCardsSede | null
}

/** La métrica que abre el panel: grande, oscura y a doble columna. */
const HERO_METRIC = {
  key: 'visitsToday' as const,
  label: 'Visitas Hoy',
  icon: TrendingUp,
  trend: 'up' as const,
}

interface SecondaryMetric {
  key: 'qrToday' | 'deliveriesToday' | 'newCustomersToday' | 'totalCustomers' | 'frequentCustomers' | 'birthdaysToday'
  label: string
  icon: typeof QrCode
  trend: 'up' | 'stable'
  /** Con una sede elegida: de dónde sale el número, debajo del título. */
  nota?: (s: AnalyticsSummary | null) => string
}

/** Las otras seis: claras, chicas y todas con el mismo peso entre sí. */
const SECONDARY_METRICS: SecondaryMetric[] = [
  { key: 'qrToday', label: 'QR Hoy', icon: QrCode, trend: 'stable' },
  { key: 'deliveriesToday', label: 'Domicilios Hoy', icon: ShoppingBag, trend: 'up' },
  { key: 'newCustomersToday', label: 'Nuevos Hoy', icon: UserPlus, trend: 'up' },
  { key: 'totalCustomers', label: 'Total Clientes', icon: Users, trend: 'up' },
  { key: 'frequentCustomers', label: 'Frecuentes (3+)', icon: Star, trend: 'stable' },
  { key: 'birthdaysToday', label: 'Cumpleaños Hoy', icon: Cake, trend: 'stable' },
]

/**
 * Las mismas seis con una sede elegida, cada una diciendo de dónde sale. Lo de visitas es de la
 * sede; lo de clientes, de los que se REGISTRARON ahí (sumando las sedes y «sin sede» da la marca).
 */
function metricasDeSede(varias: boolean): SecondaryMetric[] {
  const aqui = varias ? 'En tus sedes' : 'En esta sede'
  const registrados = varias ? 'se registraron en tus sedes' : 'se registraron aquí'
  return [
    { key: 'qrToday', label: 'QR Hoy', icon: QrCode, trend: 'stable', nota: () => aqui },
    { key: 'deliveriesToday', label: 'Domicilios Hoy', icon: ShoppingBag, trend: 'up', nota: () => aqui },
    {
      key: 'newCustomersToday',
      label: 'Nuevos Hoy',
      icon: UserPlus,
      trend: 'up',
      nota: (s) => `${varias ? 'Se registraron en tus sedes' : 'Se registraron aquí'} · ${s?.newCustomersWeek ?? 0} esta semana`,
    },
    {
      key: 'totalCustomers',
      label: varias ? 'Clientes de tus sedes' : 'Clientes de esta sede',
      icon: Users,
      trend: 'up',
      nota: () => `Los que ${registrados}`,
    },
    { key: 'frequentCustomers', label: 'Frecuentes (3+)', icon: Star, trend: 'stable', nota: () => `De los que ${registrados}` },
    { key: 'birthdaysToday', label: 'Cumpleaños Hoy', icon: Cake, trend: 'stable', nota: () => `De los que ${registrados}` },
  ]
}

export function MetricsCards({ summary, loading, sede }: MetricsCardsProps) {
  const HeroIcon = HERO_METRIC.icon
  const secundarias = sede ? metricasDeSede(sede.varias) : SECONDARY_METRICS

  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {/* ── Héroe ─────────────────────────────────────────────────────── */}
      <div className="metric-card-hero relative col-span-2 overflow-hidden rounded-2xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'rgba(var(--brand-primary-rgb), 0.18)' }}
          >
            <HeroIcon
              className="h-[18px] w-[18px]"
              strokeWidth={1.5}
              style={{ color: 'var(--brand-primary)' }}
            />
          </div>
        </div>

        {loading ? (
          <Skeleton className="mb-1 h-11 w-24 bg-white/10" />
        ) : (
          <p
            className="tabular-nums leading-none text-white"
            style={{ fontSize: '2.75rem', fontWeight: 700, letterSpacing: '-0.05em' }}
          >
            {summary?.[HERO_METRIC.key] ?? 0}
          </p>
        )}

        <p
          className="mt-2 text-xs font-semibold uppercase"
          style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}
        >
          {HERO_METRIC.label}
        </p>
        {sede && (
          <p className="relative z-10 mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {sede.varias ? 'En tus sedes' : 'En esta sede'}
          </p>
        )}

        {!loading && (
          <div className="pointer-events-none absolute bottom-0 right-0 left-0 opacity-70">
            <MiniSparkline
              trend={HERO_METRIC.trend}
              color="var(--brand-primary)"
              width="100%"
              height={54}
            />
          </div>
        )}
      </div>

      {/* ── Secundarias ───────────────────────────────────────────────── */}
      {secundarias.map((m, i) => {
        const Icon = m.icon
        return (
          <div key={m.key} className="metric-card relative overflow-hidden rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-xl"
                style={{ background: 'rgba(0,0,0,0.04)' }}
              >
                <Icon
                  className="h-4 w-4"
                  strokeWidth={1.5}
                  style={{ color: 'var(--brand-ink-soft)' }}
                />
              </div>
            </div>

            {loading ? (
              <Skeleton className="mb-1 h-8 w-14" />
            ) : (
              <p
                className="tabular-nums leading-none"
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  letterSpacing: '-0.05em',
                  color: 'var(--brand-ink)',
                  fontFamily: 'var(--font-inter)',
                }}
              >
                {summary?.[m.key] ?? 0}
              </p>
            )}

            <p
              className="mt-1 text-xs font-semibold uppercase"
              style={{ color: 'var(--brand-ink-muted)', letterSpacing: '0.04em' }}
            >
              {m.label}
            </p>
            {m.nota && (
              <p className="relative z-10 mt-0.5 pr-10 text-[11px] leading-snug" style={{ color: 'var(--brand-ink-soft)' }}>
                {m.nota(summary)}
              </p>
            )}

            {!loading && (
              <div className="pointer-events-none absolute bottom-3 right-3 opacity-45">
                <MiniSparkline
                  trend={m.trend}
                  color="var(--brand-ink-muted)"
                  delay={i * 80}
                />
              </div>
            )}
          </div>
        )
      })}

      {/* ── Sedes separadas: «Vinieron a esta sede» (solo con una sede elegida). A lo ancho
          porque necesita su frase: quien va a las dos sedes cuenta en las dos. ── */}
      {sede && (
        <div className="metric-card col-span-full flex items-center gap-4 rounded-2xl p-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'rgba(var(--brand-primary-rgb), 0.12)' }}
          >
            <Footprints className="h-5 w-5" strokeWidth={1.5} style={{ color: 'var(--brand-primary-end)' }} />
          </div>
          {loading ? (
            <Skeleton className="h-8 w-14" />
          ) : (
            <p
              className="tabular-nums leading-none"
              style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.05em', color: 'var(--brand-ink)' }}
            >
              {summary?.visitorsLast30d ?? 0}
            </p>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase" style={{ color: 'var(--brand-ink-muted)', letterSpacing: '0.04em' }}>
              {sede.varias ? 'Vinieron a tus sedes' : 'Vinieron a esta sede'} · 30 días
            </p>
            <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--brand-ink-soft)' }}>
              Clientes distintos con al menos una visita. {fraseVanAVarias(sede.sedesDeLaMarca)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
