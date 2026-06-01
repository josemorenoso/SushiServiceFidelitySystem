# Hallazgos Confirmados por Revisión de Código Fuente

> **Fecha:** 2026-05-31
> **Método:** Revisión estática de código (sin ejecución ni modificación)
> **Estado:** Pendiente de validación con evidencia de runtime (DB + logs + móvil)

---

## Hallazgo A — Puntos en 0: Query con columnas inexistentes

**Archivo:** `src/app/api/check-in/status/route.ts`  
**Líneas:** 58–63

```typescript
const { data: tx } = await supabase
  .from('point_transactions')
  .select('points')
  .eq('visit_id', recentVisit.id)   // ❌ NO EXISTE
  .eq('type', 'visit')               // ❌ NO EXISTE
  .single()
```

**Columnas reales según `src/types/database.types.ts:133-147` y `src/services/points.service.ts:152-160`:**
- `reference_id` (uuid) — ID de la visita
- `source` (text) — valores: `'visit_staff'`, `'visit_qr'`, `'visit_delivery'`

**Impacto:** La query devuelve vacío → `pointsAwarded = 0` → cliente ve "+0 puntos" aunque el saldo total esté correcto.

**Nivel de confianza:** 🔴 Alta (estructura de DB vs. código es inequívoca)

---

## Hallazgo B — Premio no aparece: `tier_unlocked` nunca llega al cliente

**Archivo 1 (servidor):** `src/app/api/check-in/status/route.ts`  
**Líneas:** 74–89

El endpoint **nunca calcula ni devuelve** `tier_unlocked` en el JSON de respuesta. Solo devuelve:
- `hasRecentVisit`, `customer`, `points_awarded`, `next_tier`, `tiers`

**Archivo 2 (cliente):** `src/components/features/check-in/CheckInForm.tsx`  
**Líneas:** 137–150

Cuando el polling detecta `hasRecentVisit: true`, hardcodea:
```typescript
message: 'points_earned'
```

Nunca lee `data.tier_unlocked` ni cambia el mensaje. Por tanto:
- `CheckInSuccess` recibe `type: 'points_earned'`
- La condición `type === 'tier_unlocked'` en `CheckInSuccess.tsx:162` nunca se cumple
- `RewardChoice` (Safe vs Mystery Box) **nunca se renderiza**

**Archivo 3 (servidor check-in):** `src/app/api/check-in/route.ts`  
**Líneas:** 549–582

El servidor SÍ calcula `newTier` y SÍ lo devuelve al **mesero** en la respuesta de `POST /api/check-in`, pero el cliente no usa ese endpoint directamente; usa el polling de `GET /api/check-in/status`.

**Impacto:** El cliente jamás ve la pantalla de elección de premio. El tier desbloqueado solo le llega al mesero.

**Nivel de confianza:** 🔴 Alta (código es explícito en ambos lados)

---

## Hallazgo C — "page couldn't load" + "Cliente" vacío: Navegación scan→confirm

### C.1 Race condition RSC en móvil

**Archivo:** `src/app/(public)/mesero/scan/page.tsx`  
**Líneas:** 127

```typescript
router.push(`/mesero/confirm?token=${encodeURIComponent(token)}`)
```

En el App Router de Next.js 16, `router.push` en móvil puede fallar al cargar el payload RSC de `/mesero/confirm` mientras `html5-qrcode` aún libera recursos de cámara. El resultado es el error genérico "This page couldn't load".

### C.2 `sessionStorage` consumido antes de confirmar navegación

**Archivo:** `src/app/(public)/mesero/confirm/page.tsx`  
**Líneas:** 44–55

```typescript
const [sessionCustomer] = useState(() => {
  const raw = sessionStorage.getItem('mesero_pending_customer')
  sessionStorage.removeItem('mesero_pending_customer')  // ❌ Borra inmediatamente
  ...
})
```

Si la navegación con `router.push` falla y el usuario recarga la página, `sessionStorage` ya está vacío. El fallback `decoded?.name` también puede fallar si `useSearchParams` (Suspense) devuelve null en el primer paint. Resultado: muestra `"Cliente"` genérico.

### C.3 `useSearchParams` gap de Suspense

**Archivo:** `src/app/(public)/mesero/confirm/page.tsx`  
**Líneas:** 28, 82

```typescript
const token = searchParams.get('token')  // puede ser null en primer paint
const decoded = token ? decodeCustomerQRTokenUnsafe(token) : null
```

Aunque el token está en la URL, el componente `MeseroConfirmContent` está dentro de `<Suspense>`. En el primer render, `searchParams` puede ser `null` o vacío, por lo que `decoded` es `null` y cae al fallback `sessionCustomer` — que ya fue borrado.

**Impacto:** Mesero ve "Cliente" en vez del nombre, debe tocar Atrás y reintentar.

**Nivel de confianza:** 🟡 Media-Alta (patrones conocidos de App Router + código confirma el flujo, pero requiere logs de runtime para confirmar el punto exacto del fallo)

---

## Hallazgo D — Verificación de datos: "Visita #1 / Visitas: 1" con saldo 75

**Archivo:** `src/services/points.service.ts`  
**Líneas:** 214–232

El bonus de bienvenida es aleatorio entre `welcome_bonus_points_min` y `welcome_bonus_points_max` (default 75–90 según `constants/rewards.ts`). Un saldo de 75 puntos con "Visita #1" indica que:
- El cliente es **nuevo** ( primera visita = registro)
- Los 75 pts vienen del **welcome bonus**, no de una visita staff_scan
- El `+0` del polling es coherente con Hallazgo A (la visita de bienvenida tiene `source = 'qr'`, no `'staff_scan'`, por lo que el endpoint de status no la encuentra como `recentVisit` anyway)

**Nota:** El total de visitas (`total_visits: 1`) es correcto para un cliente nuevo. No hay doble registro evidenciable en el código.

**Nivel de confianza:** 🟢 No es un bug (es comportamiento esperado); el `+0` se explica por A.

---

## Resumen ejecutivo

| # | Hallazgo | Confianza | Bloquea flujo |
|---|----------|-----------|---------------|
| A | Query de status usa `visit_id`/`type` → columnas reales son `reference_id`/`source` | 🔴 Alta | Sí (+0 puntos) |
| B | Status nunca devuelve `tier_unlocked`; CheckInForm hardcodea `points_earned` | 🔴 Alta | Sí (sin premio) |
| C | `router.push` RSC + `sessionStorage` borrado temprano + Suspense gap | 🟡 Media-Alta | Sí ("page couldn't load" / "Cliente") |
| D | 75 pts = welcome bonus, no visita staff_scan | 🟢 Esperado | No |

**Próximo paso:** Completar la checklist `CHECKLIST_AUDITORIA_CHECKIN.md` con evidencia de runtime (DB, logs Vercel, consola móvil) antes de escribir cualquier fix.
