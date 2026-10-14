# Feature: Invitaciones con premio (enlace o QR que regala algo)

> **Versión:** v1.1.0 — 2026-10-13 (el premio se elige del catálogo; sin migración)
> **Estado:** ✅ Implementado
> **Migración:** `00063_invitaciones_con_premio.sql`
> **Dónde vive:** `/dashboard/rewards` → pestaña **Invitaciones**
> **Ver también:** [`reward-grants.md`](reward-grants.md) · [`referral-program.md`](referral-program.md) (referidos, construido encima de esto el 2026-10-15) · [`golden-bullet.md`](golden-bullet.md)

## Qué es

El dueño crea «2x1 en sushi rolls», le queda un enlace `https://{marca}/c/promo-apertura` y su
QR. Lo manda por WhatsApp, lo pone en redes, lo imprime. Quien lo abre se registra; **el premio le
aparece en la tarjeta desde ese momento**; y lo reclama cuando viene y **el mesero lo escanea**.

Es la parte «QR dinámicos de campaña» del diseño de referidos, construida sola. **El programa de
referidos se construyó el 2026-10-15 encima de esto** ([`referral-program.md`](referral-program.md)):
la misma regla de la visita #1, el mismo `reward_grant` que el mesero entrega, con la fuente `referral`.

## Por qué NO hay «tarjeta provisional»

Otros sistemas crean una tarjeta provisional con QR que se «convierte» en la definitiva cuando la
persona llega. La inventan porque no tienen el concepto de *premio con dueño pendiente de
reclamar*. Este sistema lo tiene desde julio: **`reward_grants`**.

```
INVITACIÓN  →  registro  →  reward_grant (source='invite', activo)  →  mesero escanea  →  redeemed
                              ↑ visible en la tarjeta desde acá         ↑ visita #1 + entrega, un solo gesto
```

La tarjeta que recibe la persona al registrarse **ya es la definitiva**. El premio es un
`campaign_prize` que vive en ella. Nada nuevo que enseñarle al mesero: escanea, le salta el aviso,
toca **Entregar** — igual que con la reactivación agresiva.

## La regla que hace esto seguro

**Quien se registra por una invitación NO recibe la visita #1 automática**, tenga la marca lo que
tenga en `checkin_first_visit_free`.

`checkin_first_visit_free` supone que quien se registra está sentado en la mesa (escaneó el QR
físico). Quien llega por `/c/{slug}` se registra **desde su casa**: acreditarle la visita y los
puntos de bienvenida desde el sofá sería regalar justo lo que el premio existe para hacer ganar.

Cómo está hecho: `/api/check-in` (`register`) fuerza `pendingStaffScan = true` cuando viene
`campaign_slug`. Es la misma vía que ya existía para «primera visita validada por mesero» — se
enciende **por el origen del registro**, no con el interruptor global de la marca. Los clientes
que escanean el QR de la mesa siguen exactamente igual que hoy.

| Quién se registra | Visita #1 |
|---|---|
| Escaneó el QR de la mesa | Libre, como siempre (si la marca lo tiene así) |
| Llegó por `/c/{slug}` | **Pendiente.** Nace con 0 visitas y el premio en la tarjeta |

Cuando llega al local, el mesero lo escanea **una vez** y pasan las dos cosas: se cuenta la visita
#1 y se entrega el regalo.

### Y si ya era cliente

El caso principal de «un 2x1 por WhatsApp» son los propios clientes, y esos no pasan por `register`:
el formulario los reconoce en el `lookup`. Ahí también se le otorga el premio (pendiente del mesero,
igual). Si ya tenía una invitación activa, no pasa nada (`duplicate_active`).

## Modelo de datos

**`qr_campaigns`** — la invitación. `slug` único **por marca** (se resuelve bajo el dominio de la
marca), `reward_title`, `reward_description`, `window_days` (días para reclamar desde el registro;
NULL = no vence), `starts_at`/`ends_at`, `max_grants` (cupo de premios **otorgados**, no de
entregas), `is_active`, `location_id` (nullable, FK compuesta, como toda columna de sede).

**`reward_grants.qr_campaign_id`** — de qué invitación salió el premio. Es lo que deja contar por
invitación. Y `source` gana el valor **`'invite'`**.

> ⚠️ **Una invitación activa por cliente a la vez.** El índice único parcial de la 00031
> (`(customer_id, source) WHERE active AND campaign_prize`) significa que un cliente no puede tener
> dos premios de invitación pendientes al mismo tiempo. Es más estricto que «una vez por
> invitación» y se acepta a propósito en la v1: abrirlo exige cambiar el índice, que es el freno
> contra el premio doble. Si molesta en producción, esa es la decisión a tomar.

## El panel — pestaña «Invitaciones»

- **Nueva invitación**: nombre (para vos), qué se regala, detalle, días para reclamarlo, cupo, fecha
  límite. **«Qué se regala» se elige del catálogo de premios de la marca** (Recompensas › Premios para regalar,
  solo los activos) **o se escribe libre**, como antes (S-1, decisión C3, 2026-10-13). Elegir del catálogo solo
  LLENA el título: la invitación guarda el texto en `qr_campaigns.reward_title` y cada premio otorgado guarda su
  título como snapshot, así que retirar o renombrar el premio del catálogo después no cambia lo que ya se
  prometió. Si el catálogo está vacío o no se puede leer, el panel lo dice y el premio se escribe a mano. El slug se deriva del nombre y **no se edita después**: puede estar impreso en un QR o
  mandado por WhatsApp. Si hace falta otro, se crea otra.
- Por cada una: el **enlace** (copiar), el **QR** (descarga SVG, vector: sirve para imprimir), y
  cuatro números — **se registraron / vinieron / pendientes / vencidos**. «Vinieron» es lo que
  importa: son `reward_grants` en `redeemed`, o sea gente que el mesero escaneó.
- **Pausar / Reactivar**.
- **«Usar en Golden Bullet»**: marca esta invitación como el regalo de bienvenida de Golden Bullet.
  Quien toca «Quiero ser parte» en la plantilla recibe `/c/{slug}` en vez del enlace general de la
  tarjeta. Se guarda en `admin_settings.golden_bullet_invite_slug`.

## La landing pública `/c/{slug}`

El premio como héroe (con los colores de la marca, ningún hex horneado), la vigencia, los cupos que
quedan si hay cupo, y el **mismo `CheckInForm` de siempre** con `campaignSlug`. Si la invitación
está pausada, vencida o agotada, lo dice y no muestra el formulario.

**En una marca de 2+ sedes** el registro en el dominio raíz pide la sede (el 409 de D21). Hasta el
2026-10-15 el selector mandaba a la RAÍZ de la sede elegida y el slug se perdía (la persona se
registraba sin premio); desde los referidos manda a la misma ruta en la sede
(`https://{sede}/c/{slug}?phone=…`, `urlDeLaSede()`).

`GET /api/invite/{slug}` es público y devuelve solo lo que ya estaba en el mensaje compartido. La
marca sale del dominio: un slug de la marca A no se lee desde el dominio de la marca B.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/dashboard/qr-campaigns` | Las de la marca con sus números + `public_base` + `golden_bullet_invite_slug` |
| POST | `/api/dashboard/qr-campaigns` | Crear |
| PATCH | `/api/dashboard/qr-campaigns` | Editar (`id` en el body). El slug no se edita |
| GET | `/api/invite/{slug}` | Público. Lo que la landing necesita |
| POST | `/api/check-in` | `lookup` y `register` aceptan `campaign_slug` |

## Recompensas ahora es una sola pantalla

`/dashboard/rewards` tiene cuatro pestañas: **Niveles y premios** (lo de siempre), **Invitaciones**
(esto), **Premios para regalar** (el catálogo y para qué se usa cada premio, desde 2026-10-13: ver
[`reward-grants.md`](reward-grants.md) § «Dónde vive cada premio») y **Redenciones** (antes era
`/dashboard/redemptions`; esa ruta **redirige** para no romper ningún enlace guardado). La pestaña inicial se lee de `?tab=` con `useSyncExternalStore`, no con
`useSearchParams()` — ver la trampa del CSR bailout en `CLAUDE.md`.

## Por qué NO se enlazó la invitación al catálogo por id (C3, 2026-10-13)

Se evaluó guardar `campaign_reward_id` en `qr_campaigns` (una columna nullable con FK `ON DELETE SET NULL`) y **no hace
falta**: `grantFromInvite()` otorga con `prizeTitle: reward_title`, y todo lo que lee ese premio después (la tarjeta, el
aviso del mesero, las métricas por invitación) usa el título guardado en el grant o `qr_campaign_id`, nunca el id del
catálogo. Enlazarla por id añadiría dos cosas que nadie pidió —que renombrar el premio del catálogo cambiara lo que ya
prometió una invitación impresa, y que retirarlo la dejara sin premio— y una migración. Si algún día se quiere contar
«cuántas invitaciones usan este premio», es una columna nueva, no una corrección. Los tres modelos de premio (niveles,
catálogo de campaña, invitaciones) **siguen sin unificarse**.

## Referidos, encima de esto (2026-10-15)

Construido: [`referral-program.md`](referral-program.md). Comparte la regla de la visita #1 (el amigo
que llega por `/r/{código}` también queda pendiente del mesero), el `reward_grant` que el mesero
entrega (fuente `referral`, badge **REFERIDO**) y el formulario (`CheckInForm` con `referralCode`).
Lo nuevo: el código por cliente, la relación referidor → referido y que **los dos** ganen cuando el
mesero valida al amigo (`completar_referido()`, 00075).

## Archivos

- `supabase/migrations/00063_invitaciones_con_premio.sql`
- `src/services/qr-campaign.service.ts` (`checkAvailability`, `slugify`, `grantFromInvite`)
- `src/services/reward-grant.service.ts` (`qrCampaignId`), `src/types/database.types.ts` (`GrantSource`)
- `src/app/api/dashboard/qr-campaigns/route.ts`, `src/app/api/invite/[slug]/route.ts`
- `src/app/(public)/c/[slug]/page.tsx`
- `src/app/api/check-in/route.ts`, `src/components/features/check-in/CheckInForm.tsx` + `.types.ts`
- `src/components/features/staff/{PendingRewardsList,RewardAlert}.tsx` (badge «INVITACIÓN»)
- `src/app/(dashboard)/dashboard/rewards/page.tsx`, `redemptions/page.tsx` (redirect)
- `src/components/dashboard/{RewardsLevelsPanel,RedemptionsPanel,InviteCampaignsPanel,PremiosParaRegalarPanel}.tsx`
- `src/components/layout/{DashboardSidebar,DashboardHeader}.tsx`
- `src/services/club-optin.service.ts` (Golden Bullet → invitación)
- `tests/unit/qr-campaigns.test.ts`, `tests/unit/recompensas-un-solo-lugar.test.ts` (C3)
