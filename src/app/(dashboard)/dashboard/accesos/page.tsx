'use client'

/**
 * Accesos — quién entra al panel de esta marca y qué ve.
 *
 * El dueño, 2026-09-08: *"si usas el super usuario te lleva al perfil completo
 * con todas las sedes y si usas el perfil de administrador te lleva a ver solo
 * tu perfil de sede"*, y *"necesito poder agregar super usuarios y
 * administradores desde el AIOS y también desde configuración desde el
 * dashboard"*. Esta es la mitad del dashboard.
 *
 * NO HAY UN BOTÓN DE INICIO DE SESIÓN POR ROL, Y ES A PROPÓSITO
 * ────────────────────────────────────────────────────────────
 * Se entra por el MISMO `/login` con el mismo botón. El rol no se elige al
 * entrar: se lee de `dashboard_user_locations` en el servidor y decide lo que se
 * ve. Dos botones distintos serían una pregunta que el usuario no puede
 * responder («¿yo soy super usuario o administrador?») y, peor, una pista de qué
 * roles existen para quien no debería saberlo. La diferencia se nota sola: un
 * administrador de sede no ve el selector de «Todas las sedes» ni esta pantalla.
 *
 * LAS CONTRASEÑAS SE ENSEÑAN UNA VEZ Y NO SE GUARDAN
 * ─────────────────────────────────────────────────
 * Ni acá ni en la base. Si se pierde, un super usuario le pone otra desde esta
 * misma pantalla — que es justo lo que hasta hoy no se podía hacer en ningún
 * lado y obligaba a entrar al Supabase a mano.
 *
 * Ref: docs/features/multi-sede.md §7.3 · migración 00045
 */

import { useCallback, useEffect, useState } from 'react'
import {
  KeyRound, UserPlus, Loader2, AlertTriangle, Copy, Check, Trash2,
  ShieldCheck, Store, RotateCcw,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Usuario {
  id: string
  email: string
  role: 'brand' | 'location'
  locationIds: string[]
  sinAlcanceExplicito: boolean
  createdAt: string | null
  lastSignInAt: string | null
}

interface Sede {
  id: string
  name: string
  is_active: boolean
}

/** Una credencial recién generada. Se enseña una vez y se va al recargar. */
interface Credencial {
  email: string
  password: string
}

function CopiaBoton({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(texto)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2000)
      }}
      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
    >
      {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copiado ? 'Copiado' : 'Copiar'}
    </button>
  )
}

export default function AccesosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [sedes, setSedes] = useState<Sede[]>([])
  const [multiSede, setMultiSede] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [credencial, setCredencial] = useState<Credencial | null>(null)

  // Alta
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<'brand' | 'location'>('brand')
  const [sedesElegidas, setSedesElegidas] = useState<string[]>([])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ru, rl] = await Promise.all([
        fetch('/api/dashboard/users'),
        fetch('/api/dashboard/locations'),
      ])
      const ju = await ru.json()
      if (!ru.ok) {
        setError(ju.error ?? 'No se pudieron cargar los accesos')
        return
      }
      setUsuarios(ju.users ?? [])
      setMultiSede(ju.multiSede === true)

      if (rl.ok) {
        const jl = await rl.json()
        setSedes((jl.locations ?? []).map((l: Sede) => ({ id: l.id, name: l.name, is_active: l.is_active })))
      }
    } catch {
      setError('No se pudieron cargar los accesos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const crear = async () => {
    setTrabajando(true)
    setError(null)
    setCredencial(null)
    try {
      const r = await fetch('/api/dashboard/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: rol, location_ids: sedesElegidas }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error ?? 'No se pudo crear el acceso'); return }
      if (j.password) setCredencial({ email: j.email, password: j.password })
      if (Array.isArray(j.warnings) && j.warnings.length > 0) setError(j.warnings.join(' '))
      setEmail('')
      setSedesElegidas([])
      await cargar()
    } catch {
      setError('No se pudo crear el acceso')
    } finally {
      setTrabajando(false)
    }
  }

  const nuevaClave = async (u: Usuario) => {
    if (!confirm(`¿Ponerle una contraseña nueva a ${u.email}? La anterior deja de servir.`)) return
    setTrabajando(true)
    setError(null)
    setCredencial(null)
    try {
      const r = await fetch(`/api/dashboard/users/${u.id}/password`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) { setError(j.error ?? 'No se pudo cambiar la contraseña'); return }
      setCredencial({ email: j.email, password: j.password })
    } catch {
      setError('No se pudo cambiar la contraseña')
    } finally {
      setTrabajando(false)
    }
  }

  const quitar = async (u: Usuario) => {
    if (!confirm(`¿Quitarle el acceso a ${u.email}? Deja de poder entrar al panel.`)) return
    setTrabajando(true)
    setError(null)
    try {
      const r = await fetch(`/api/dashboard/users/${u.id}`, { method: 'DELETE' })
      const j = await r.json()
      if (!r.ok) { setError(j.error ?? 'No se pudo quitar el acceso'); return }
      await cargar()
    } catch {
      setError('No se pudo quitar el acceso')
    } finally {
      setTrabajando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando los accesos…
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <KeyRound className="h-5 w-5" /> Accesos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quién puede entrar a tu panel y qué ve cada uno. Todos entran por el mismo enlace y con el
          mismo botón: lo que cambia es lo que encuentran adentro.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* La credencial recién generada. Va arriba del todo porque no se repite. */}
      {credencial && (
        <Card className="border-emerald-300 bg-emerald-50/60">
          <CardHeader>
            <CardTitle className="text-base">Copiá esto ahora</CardTitle>
            <CardDescription>La contraseña no se vuelve a mostrar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Usuario:</span>
              <code className="rounded bg-white px-2 py-1 text-sm">{credencial.email}</code>
              <CopiaBoton texto={credencial.email} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Contraseña:</span>
              <code className="rounded bg-white px-2 py-1 text-sm">{credencial.password}</code>
              <CopiaBoton texto={credencial.password} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Quiénes entran hoy ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiénes entran hoy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {usuarios.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.email}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {u.role === 'brand' ? (
                    <><ShieldCheck className="h-3 w-3" /> Super usuario — ve y edita todas las sedes</>
                  ) : (
                    <>
                      <Store className="h-3 w-3" /> Administrador de{' '}
                      {u.locationIds
                        .map((id) => sedes.find((s) => s.id === id)?.name ?? 'una sede')
                        .join(', ') || 'ninguna sede'}
                    </>
                  )}
                </p>
                {/*
                  Sin fila de alcance y con dos o más sedes, el panel le responde
                  403 en cuanto entra. Decirlo acá es la diferencia entre un
                  arreglo de un click y una llamada de "no me deja entrar".
                */}
                {u.sinAlcanceExplicito && multiSede && (
                  <p className="mt-1 text-xs font-medium text-amber-600">
                    Sin alcance asignado: no va a poder entrar hasta que le elijas uno.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => nuevaClave(u)} disabled={trabajando}>
                  <RotateCcw className="mr-1.5 h-3 w-3" /> Nueva contraseña
                </Button>
                <Button variant="outline" size="sm" onClick={() => quitar(u)} disabled={trabajando}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          {usuarios.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay nadie más que vos.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Dar acceso a alguien ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" /> Dar acceso a alguien
          </CardTitle>
          <CardDescription>
            Le generamos una contraseña y te la mostramos una vez para que se la pases.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="nuevo-email">Correo</Label>
            <Input
              id="nuevo-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="encargado@turestaurante.com"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Tiene que ser un correo que esa persona lea de verdad.
            </p>
          </div>

          {/*
            Con una sola sede no hay nada que elegir: "todas las sedes" y "mi
            sede" son el mismo conjunto, así que preguntar el rol solo confunde.
            Todos nacen super usuarios, que es el comportamiento de siempre.
          */}
          {multiSede && (
            <div className="space-y-3">
              <div>
                <Label>Qué va a poder ver</Label>
                <div className="mt-2 space-y-2">
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3">
                    <input
                      type="radio"
                      className="mt-1"
                      checked={rol === 'brand'}
                      onChange={() => setRol('brand')}
                    />
                    <span>
                      <span className="block text-sm font-medium">Super usuario</span>
                      <span className="block text-xs text-muted-foreground">
                        Todas las sedes, y puede dar accesos como este.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3">
                    <input
                      type="radio"
                      className="mt-1"
                      checked={rol === 'location'}
                      onChange={() => setRol('location')}
                    />
                    <span>
                      <span className="block text-sm font-medium">Administrador de sede</span>
                      <span className="block text-xs text-muted-foreground">
                        Solo las sedes que le marques. No ve las demás ni puede dar accesos.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              {rol === 'location' && (
                <div>
                  <Label>De qué sedes</Label>
                  <div className="mt-2 space-y-1">
                    {sedes.filter((s) => s.is_active).map((s) => (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={sedesElegidas.includes(s.id)}
                          onChange={(e) =>
                            setSedesElegidas((prev) =>
                              e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)
                            )
                          }
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <Button onClick={crear} disabled={trabajando || email.trim().length === 0}>
            {trabajando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Crear acceso
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
