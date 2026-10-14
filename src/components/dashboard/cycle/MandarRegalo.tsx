'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  QUE_RECIBEN,
  avisoDePlantillaDelRegalo,
  cantidad,
  hoyEnBogota,
  horaLegible,
  leerJson,
  textoDelCupo,
  textoNoLoReciben,
  vistaPreviaDelWhatsAppDelRegalo,
  type Lectura,
} from '@/lib/cycle-screen'
import type { ReglaDeVencimiento } from '@/lib/cycle-touch'
import type { AudienciaDeRegalo } from '@/services/cycle-overview.service'
import type { VistaPreviaDelRegalo } from '@/services/cycle-gift.service'

const OTRO = '__otro__'

/** La audiencia con que abre el creador: la pedida (una caja tocada), o el Rescate, o «Todos». */
function audienciaInicial(v: VistaPreviaDelRegalo, pedida?: AudienciaDeRegalo): AudienciaDeRegalo {
  const disponible = (k: AudienciaDeRegalo) => v.audiencias.some((a) => a.clave === k && a.disponible)
  if (pedida && disponible(pedida)) return pedida
  return disponible('t4') ? 't4' : 'todos'
}

const ETIQUETA_DE_REGLA: Readonly<Record<Exclude<ReglaDeVencimiento, 'domingo'>, string>> = {
  '3': 'En 3 días',
  '7': 'En 7 días',
  '14': 'En 14 días',
}

type Programado = { ok: true; mensaje: string } | { ok: false; mensaje: string } | null

/**
 * «Mandar un regalo» en tres campos (spec §6.5) — el botón principal de la pantalla. Regalo (del
 * catálogo, o escribirlo y queda) · hasta cuándo («este domingo» por defecto, 3/7/14 días) · a
 * quién (una caja, dormidos, todos, con el conteo vivo) · cuándo (hoy a la hora de la marca, o
 * una fecha). Debajo, el cupo («Hoy puedes mandar 180») y la vista previa del WhatsApp real.
 *
 * **El regalo se otorga al ENVIAR**, no al programar: lo dice la confirmación. Todo lo que se
 * muestra sale de `GET /api/dashboard/cycle/gift` (el mismo motor que las cajas); un fallo dice
 * «no pudimos preparar el regalo» y no dibuja ningún conteo.
 */
export function MandarRegalo({
  lectura,
  cuando,
  onCuando,
  audienciaPedida,
  puedeMandar,
  onProgramado,
  programar = programarEnElServidor,
}: {
  /** `null` = cargando. */
  lectura: Lectura<VistaPreviaDelRegalo> | null
  /** `hoy` o `AAAA-MM-DD`: la vista previa se pide para este día. */
  cuando: string
  onCuando: (cuando: string) => void
  audienciaPedida?: AudienciaDeRegalo
  /** Alcance de marca (un administrador de una sede no le manda un regalo a toda la marca). */
  puedeMandar: boolean
  onProgramado?: () => void
  /** Inyectable para las pruebas. */
  programar?: (cuerpo: unknown) => Promise<Lectura<{ mensaje: string }>>
}) {
  if (!lectura) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Preparando el regalo">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  if (!lectura.ok) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        {lectura.mensaje}
      </p>
    )
  }
  return (
    // Sin `key`: cambiar el «cuándo» vuelve a pedir la vista previa y el formulario conserva lo elegido.
    <FormularioDelRegalo
      v={lectura.datos}
      cuando={cuando}
      onCuando={onCuando}
      audienciaPedida={audienciaPedida}
      puedeMandar={puedeMandar}
      onProgramado={onProgramado}
      programar={programar}
    />
  )
}

async function programarEnElServidor(cuerpo: unknown): Promise<Lectura<{ mensaje: string }>> {
  return leerJson<{ mensaje: string }>('/api/dashboard/cycle/gift', 'No pudimos programar el regalo. No salió nada: intenta de nuevo.', {
    init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) },
  })
}

function FormularioDelRegalo({
  v,
  cuando,
  onCuando,
  audienciaPedida,
  puedeMandar,
  onProgramado,
  programar,
}: {
  v: VistaPreviaDelRegalo
  cuando: string
  onCuando: (cuando: string) => void
  audienciaPedida?: AudienciaDeRegalo
  puedeMandar: boolean
  onProgramado?: () => void
  programar: (cuerpo: unknown) => Promise<Lectura<{ mensaje: string }>>
}) {
  const [regaloId, setRegaloId] = useState<string>(v.regalos[0]?.id ?? OTRO)
  const [otro, setOtro] = useState('')
  const [regla, setRegla] = useState<ReglaDeVencimiento>('domingo')
  const [audiencia, setAudiencia] = useState<AudienciaDeRegalo>(() => audienciaInicial(v, audienciaPedida))
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Programado>(null)

  const elegida = v.audiencias.find((a) => a.clave === audiencia) ?? null
  const titulo = regaloId === OTRO ? otro.trim() : (v.regalos.find((r) => r.id === regaloId)?.titulo ?? '')
  const vence = v.vence.find((x) => x.regla === regla) ?? null
  const plantilla = v.plantilla.clave === 'gift_expiring' || v.plantilla.clave === 'reactivation_aggressive' ? v.plantilla.clave : null
  const aviso = avisoDePlantillaDelRegalo(v.plantilla)
  const fuera = elegida ? textoNoLoReciben(elegida.no_reciben) : null
  const conFecha = cuando !== 'hoy'
  const listo = puedeMandar && !!plantilla && !!titulo && !!elegida && elegida.reciben > 0 && !!v.sale && !enviando

  const enviar = async () => {
    setEnviando(true)
    setResultado(null)
    const r = await programar({
      regalo: regaloId === OTRO ? { titulo } : { id: regaloId },
      vence: regla,
      audiencia,
      cuando,
    })
    setEnviando(false)
    if (r.ok) {
      setResultado({ ok: true, mensaje: r.datos.mensaje })
      onProgramado?.()
    } else {
      setResultado({ ok: false, mensaje: r.mensaje })
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
      <div className="min-w-0 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="regalo-premio">Regalo</Label>
          <select
            id="regalo-premio"
            value={regaloId}
            onChange={(e) => setRegaloId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {v.regalos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.titulo}
              </option>
            ))}
            <option value={OTRO}>Escribir otro…</option>
          </select>
          {regaloId === OTRO && (
            <>
              <Input aria-label="Qué le regalas" placeholder="Ej. Postre del chef" value={otro} maxLength={80} onChange={(e) => setOtro(e.target.value)} />
              <p className="text-xs text-muted-foreground">Queda guardado en tu catálogo de Recompensas para la próxima.</p>
            </>
          )}
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Hasta cuándo</legend>
          <div className="flex flex-wrap gap-1.5">
            {v.vence.map((x) => (
              <Chip key={x.regla} activo={regla === x.regla} onClick={() => setRegla(x.regla)}>
                {x.regla === 'domingo' ? `Este ${x.texto}` : ETIQUETA_DE_REGLA[x.regla]}
              </Chip>
            ))}
          </div>
          {vence && regla !== 'domingo' && <p className="text-xs text-muted-foreground">Vence el {vence.texto} si sale ese día; se cuenta desde que le llega.</p>}
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">A quién</legend>
          <div className="flex flex-wrap gap-1.5">
            {v.audiencias.map((a) => (
              <Chip
                key={a.clave}
                activo={audiencia === a.clave}
                disabled={!a.disponible || a.total === 0}
                title={!a.disponible ? QUE_RECIBEN.reciente : undefined}
                onClick={() => setAudiencia(a.clave)}
              >
                {a.etiqueta} <span className="tabular-nums opacity-70">{cantidad(a.disponible ? a.reciben : a.total)}</span>
              </Chip>
            ))}
          </div>
          {elegida && (
            <p className="text-xs text-muted-foreground">
              Lo reciben <b className="tabular-nums">{cantidad(elegida.reciben)}</b> de {cantidad(elegida.total)}.
              {fuera ? ` No lo reciben: ${fuera}.` : ''}
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Cuándo</legend>
          <div className="flex flex-wrap gap-1.5">
            <Chip activo={!conFecha} onClick={() => onCuando('hoy')}>
              A la hora de tu marca ({horaLegible(v.hora)})
            </Chip>
            <Chip activo={conFecha} onClick={() => onCuando(conFecha ? cuando : hoyEnBogota())}>
              Elegir fecha
            </Chip>
          </div>
          {conFecha && (
            <Input
              type="date"
              aria-label="Fecha de envío"
              value={cuando}
              min={hoyEnBogota()}
              onChange={(e) => e.target.value && onCuando(e.target.value)}
              className="w-auto"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {v.sale_texto ? `Sale ${v.sale_texto}.` : 'Esa fecha no sirve: elige hoy o un día de los próximos 60.'}
          </p>
        </fieldset>

        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs">{textoDelCupo(v.cupo, !conFecha)}</p>
        {aviso && <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{aviso}</p>}
        {!puedeMandar && (
          <p className="text-xs text-muted-foreground">Un regalo le llega a clientes de toda la marca: lo manda un super usuario.</p>
        )}

        {resultado?.ok ? (
          <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            {resultado.mensaje}
          </p>
        ) : (
          <div className="space-y-2">
            {resultado && !resultado.ok && (
              <p role="alert" className="text-sm text-red-700">
                {resultado.mensaje}
              </p>
            )}
            <Button type="button" disabled={!listo} onClick={enviar}>
              {enviando ? 'Programando…' : elegida ? `Programar ${cantidad(elegida.reciben)} ${elegida.reciben === 1 ? 'regalo' : 'regalos'}` : 'Programar'}
            </Button>
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Así lo ve el cliente</p>
        <BurbujaDeWhatsApp
          texto={
            plantilla
              ? vistaPreviaDelWhatsAppDelRegalo(v, plantilla, titulo || 'tu regalo', vence?.texto ?? '…')
              : 'Sin plantilla para mandar regalos todavía.'
          }
        />
        {plantilla === 'reactivation_aggressive' && (
          <p className="text-xs text-muted-foreground">
            Con tu mensaje insistente de siempre. En la tarjeta, {v.ejemplo.nombre} ve: «Disponible: {titulo || 'tu regalo'} · vence el {vence?.texto ?? '…'}».
          </p>
        )}
      </div>
    </div>
  )
}

export function Chip({
  activo,
  disabled,
  title,
  onClick,
  children,
}: {
  activo: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        activo ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]' : 'hover:bg-muted/50'
      }`}
    >
      {children}
    </button>
  )
}

/** El WhatsApp tal como llega (los `*negritas*` y `_cursivas_` se quedan como los ve el cliente en el texto). */
export function BurbujaDeWhatsApp({ texto, conFoto = false }: { texto: string; conFoto?: boolean }) {
  return (
    <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
      <div className="max-w-full overflow-hidden rounded-lg bg-background p-2.5 text-[13px] leading-snug shadow-sm">
        {conFoto && (
          <div className="mb-2 flex h-24 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">📷 tu foto</div>
        )}
        <p className="whitespace-pre-wrap break-words">{texto}</p>
      </div>
    </div>
  )
}
