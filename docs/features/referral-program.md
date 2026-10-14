# Feature: Programa de Referidos (el cliente trae a un amigo y los dos ganan)

> **Estado:** ✅ CONSTRUIDO el 2026-10-15 (prompt `docs/prompts/2026-10-15-referidos.md`) · **migración `00075_referidos.sql`,
> SIN aplicar: va en Supabase ANTES del push** · **apagado por defecto en todas las marcas** (se enciende en Recompensas ›
> Referidos). La parte «QR dinámicos de campaña» del plan viejo se construyó antes, sola, como
> [`invite-campaigns.md`](invite-campaigns.md) (2026-09-11); referidos se para encima de eso.
> **Ver también:** [`reward-grants.md`](reward-grants.md) · [`invite-campaigns.md`](invite-campaigns.md) ·
> [`multi-sede.md`](multi-sede.md) §3.bis · `docs/PENDIENTES.md` S-6 y §8 C7.

---

## 1. Qué hace, en cinco líneas

1. El cliente ve en su tarjeta **«🎁 Gánate {X} por traer a un amigo»**. Al tocarlo: su enlace `https://{dominio}/r/{CÓDIGO}`,
   «Copiar», **«Compartir por WhatsApp»** (`wa.me/?text=…`: su WhatsApp PERSONAL) y «Tus invitados» con su estado.
2. El amigo abre el enlace: **«{Nombre} te regaló {beneficio} 🎁»** y el registro de siempre.
3. Se registra → queda **pendiente del mesero** (0 visitas), con su regalo **en la tarjeta** desde ya.
4. Viene y **el mesero lo escanea** → se cuenta su visita #1, se le entrega el regalo, y **quien lo trajo gana su premio**
   (una sola vez, con la sede de esa visita).
5. Si no viene en N días (30), el referido **vence** y nadie gana.

**Principio anti-fraude (el de siempre):** ningún premio sale sin presencia física verificada por el mesero.

## 2. Las decisiones (comandante, 2026-10-15; son AJUSTES de cada marca)

| # | Decisión | Dónde vive |
|---|---|---|
| 1 | **Ganan los dos.** Cada uno, por marca: un premio del catálogo (Premios para regalar), **puntos**, o **nada** | `referral_referrer_reward_*`, `referral_referred_reward_*` |
| 2 | El premio de quien invita se gana cuando el amigo **VIENE** (escaneo del mesero), nunca al registrarse. El regalo del amigo queda en su tarjeta desde el registro y se entrega en esa visita | `completar_referido()` + `POST /api/check-in` |
| 3 | Un teléfono se refiere **una vez por marca**; quien ya es cliente **no cuenta**; nadie se refiere a sí mismo; **tope de premios por referidor al mes** (default **10**); un pendiente vence a los **30 días** (ajuste) | 00075 (UNIQUE, CHECK) + `referral_monthly_cap`, `referral_pending_expiry_days` |
| 4 | **Apagado por defecto** en todas las marcas | `referral_enabled` (sin fila = apagado) |
| 5 | **Sin plantillas nuevas.** El amigo recibe el enlace por el WhatsApp personal de quien invita: no gasta cupo de la línea, no pide aprobación de Meta y quien invita nunca escribe el teléfono del amigo (Ley 1581: el amigo da su propio consentimiento al registrarse) | `wa.me` en la tarjeta |
| 6 | **Es de la marca, no de la sede**: el enlace sirve en cualquier sede y el premio se canjea en cualquiera | §5 |

### Lo que se decidió en la sesión y no estaba en el prompt

- **Los puntos del amigo se suman en su visita #1, no al registrarse** (como regalo en puntos): puntos desde el sofá es
  justo lo que la regla de la visita #1 evita. Un regalo del catálogo, en cambio, sí aparece en la tarjeta desde el registro.
- **Un solo número de días** para todo: los que tiene el amigo para venir **y** los que dura cada premio para reclamarlo (el
  del amigo y el de quien invita). Menos ajustes, una sola frase en la pantalla. La fecha de vencimiento del referido se fija
  al registrarse (`referrals.expires_at`): cambiar el ajuste después no le mueve la fecha a nadie.
- **Encender exige un premio para quien invita.** Sin eso el botón no tiene qué prometer y no aparece.
- **Apagar congela**: con el programa apagado el escaneo no completa nada (una marca apagada no paga ni una consulta más
  por escaneo). El regalo que el amigo ya tiene en su tarjeta es un premio como cualquiera y se entrega igual; quien lo
  invitó no gana por los que vengan con el programa apagado. Es el default conservador (lo cuesta la marca).
- **El código se crea la primera vez que la tarjeta lo pide** (`GET /api/referral/me`), no para toda la base.
- **El amigo ve solo el PRIMER nombre de quien lo invita**, y quien invita, solo el primer nombre de cada invitado.
- **El selector de sede del registro (el 409 de una marca de 2+ sedes) conserva la ruta**: quien llega por `/r/{código}`
  sigue con su código en la sede elegida. Antes mandaba a la raíz de la sede y se perdía; con eso también se arregló la
  invitación `/c/{slug}`, que tenía el mismo problema.

## 3. La marca de dos sedes (Tepuy) — cómo funciona el enlace

Con 2+ sedes, el dominio RAÍZ no registra a nadie (D21: responde 409 con la lista de sedes). Dos piezas:

1. **El enlace sale con el dominio de la sede donde quien invita vino por última vez** (`customers.last_visit_location_id`),
   cuando la tarjeta se mira desde la raíz (`dominioDelEnlace()`, `src/lib/referidos.ts`). En un subdominio de sede, o en una
   marca de 0-1 sedes, sale el host de siempre.
2. Si esa sede no se sabe (o no tiene dominio), sale la raíz y **la landing pregunta la sede**: el selector manda a
   `https://{sede}/r/{código}?phone=…` (`urlDeLaSede()`), con el código y el teléfono ya escrito.

La sede de registro del amigo y la de su visita se anotan como siempre (F3: `customers.origin_location_id`,
`visits.location_id`); el regalo del amigo lleva la sede del registro y el premio de quien invita la de la visita del amigo
(`reward_grants.granted_location_id`). El canje (`reward_redemptions.redeemed_location_id`) es donde se entregó: cualquiera.

## 4. Modelo de datos (00075)

- **`customers_id_tenant_key UNIQUE (id, tenant_id)`** — el soporte de las FK COMPUESTAS hacia un cliente (la primera vez
  que una tabla apunta a `customers` con la marca en la llave).
- **`referral_codes`** — `(tenant_id, customer_id, code)`. Un código por cliente y marca; único POR MARCA (el de la marca A
  no existe en la B). Alfabeto sin `0/O/1/I/L` (CHECK). FK compuesta al cliente, `ON DELETE CASCADE`.
- **`referrals`** — `referrer_customer_id`, `referred_customer_id`, `referred_phone`, `code`, `status`
  (`pending · completed · expired`), `referrer_rewarded`, `created_at`, `expires_at`, `completed_at`, `expired_at`.
  - `UNIQUE (tenant_id, referred_phone)`: **un teléfono se refiere una vez por marca**.
  - `CHECK referred <> referrer`: nadie se refiere a sí mismo.
  - CHECKs de pareja: `completed ⇔ completed_at`, `expired ⇔ expired_at`, `referrer_rewarded ⇒ completed`.
  - `referrer_rewarded = false` en un completado = tope del mes lleno (o la marca sin premio para quien invita). **El tope
    cuenta solo los premiados.**
- **`reward_grants`**: fuente **`referral`** (CHECK), columna **`referral_id`**, y el freno
  **`idx_reward_grants_referral_once UNIQUE (referral_id, customer_id)`**: un premio por referido y por persona (el regalo
  del amigo y el premio de quien lo trajo son dos filas). El índice de la 00031 (un premio de campaña ACTIVO por cliente y
  fuente) **deja de aplicar a `referral`**: quien trae a tres amigos tiene tres premios pendientes; con el índice viejo el
  segundo moría como `duplicate_active`. Para las demás fuentes no cambia nada.
- **`completar_referido(p_tenant_id, p_referred_customer_id, p_monthly_cap, p_reward_referrer) → jsonb`** — la ÚNICA puerta
  pendiente → completado. `FOR UPDATE` de la fila (dos escaneos simultáneos: el segundo espera y ve `ya_resuelto`) y un
  `pg_advisory_xact_lock` por quien invita para el tope (dos amigos suyos validados a la vez no pasan el tope entre los dos;
  el mes se cuenta en Bogotá). Resultados: `sin_referido · ya_resuelto · vencido · completado · tope`. Sin EXECUTE para
  `anon`/`authenticated`.
- `point_transactions.source` gana `'referral'` (con `reference_id` = el referido). No tiene CHECK: no hizo falta migrar.

**Vencidos sin cron** (`vercel.json` no se toca): se marcan al leer (panel, tarjeta: `vencerPendientes()`) y al escanear
(`completar_referido()`). Lo que se muestra no depende de eso (`estadoVisible()`).

## 5. El flujo en el código

| Momento | Quién | Qué hace |
|---|---|---|
| Quien invita abre su tarjeta | `GET /api/referral/me?phone=` | `{ activo: false }` si el programa está apagado o no hay premio para quien invita. Si no: código (se crea la primera vez), enlace, texto, `whatsapp_url`, invitados |
| El amigo abre `/r/{código}` | `GET /api/referral/{código}` | Primer nombre + regalo + días. 404 si el código no existe en esta marca o el programa está apagado → la landing normal |
| El amigo se registra | `POST /api/check-in` `register` + `referral_code` | `prepararReferido()` ANTES de crear al cliente (¿cuenta?) → visita #1 pendiente; `registrarReferido()` DESPUÉS (fila pendiente + regalo del catálogo en la tarjeta, `granted_location_id` = sede del registro). Si no cuenta, el registro es el de siempre |
| Ya es cliente | `POST /api/check-in` `lookup` + `referral_code` | `referral_status: 'ya_cliente'`; no se otorga nada |
| El mesero lo escanea | `POST /api/check-in` `checkin` (staff) | Los ajustes viajan en la MISMA lectura de settings; con el programa encendido, `completarReferidoAlEscanear()` → la base decide una vez → premio de quien invita (catálogo o puntos) con la sede de esta visita, y los puntos del amigo si su regalo eran puntos. `referral_completed: true` en la respuesta. Nunca tumba el escaneo |
| Quien invita viene | El de siempre | Su premio le salta al mesero (badge **REFERIDO**) y se entrega con `POST /api/reward-redeem`, en cualquier sede |

## 6. Pantallas

- **Tarjeta del cliente** (`CustomerCard`, debajo del QR), **pantalla de éxito tras sumar** (`CheckInSuccess`) y **`/tarjeta`**
  (`WalletCard`, hueco `extra`): `ReferidosBoton` (`src/components/features/referidos/`). Si la lectura falla o el programa
  está apagado, no dibuja nada. Sin hex nuevos: el color sale de la marca.
- **Landing** `/r/{código}` (`src/app/(public)/r/[code]/page.tsx`): el regalo como héroe, «Los dos ganan cuando vengas», el
  formulario de siempre con el código. Sin referido válido, la landing de siempre. Se mide como el check-in (píxel).
- **Panel**: Recompensas › **Referidos** (`ReferidosPanel`): encender/apagar, qué gana cada uno (el `SelectorDePremio` de
  Premios para regalar, puntos o nada), tope al mes, días para venir, el mensaje con `{nombre}`, `{beneficio}`, `{marca}` y
  `{enlace}` y su vista previa; y los números (conteos, **nunca pesos**): se registraron, vinieron, pendientes, vencidos,
  premios ganados y entregados, regalos entregados, los que más traen. Un administrador de sede lo ve y no lo cambia.
- **Mesero**: el badge **REFERIDO** en la lista de premios (`PendingRewardsList`) y en la alerta al escanear (`RewardAlert`).

Visto a 390 px (Edge sin cabeza, build de producción local, datos de muestra, 2026-10-15): tarjeta con el panel abierto,
landing y pestaña del panel, sin desborde horizontal.

## 7. Ajustes (`admin_settings`, los escribe SOLO `PUT /api/dashboard/referrals`)

| Clave | Default | Qué es |
|---|---|---|
| `referral_enabled` | `false` | Encendido |
| `referral_referrer_reward_type` | `none` | `reward` · `points` · `none` (quien invita) |
| `referral_referrer_reward_id` / `_points` | — | El premio del catálogo (activo, de ESTA marca) o los puntos (1–10.000) |
| `referral_referred_reward_type` / `_id` / `_points` | `none` | Lo mismo, para el amigo |
| `referral_monthly_cap` | `10` | Premios de quien invita por mes (1–1.000) |
| `referral_pending_expiry_days` | `30` | Días para venir (y para reclamar cada premio) (1–365) |
| `referral_share_message` | el de `MENSAJE_DEFAULT` | El texto que se comparte (≤600). Sin `{enlace}`, el enlace se agrega al final |

`PUT /api/dashboard/settings` las **rechaza** con 400 («se cambia en Recompensas › Referidos»): por la ruta genérica un premio
de otra marca entraría sin que nadie lo mire. `PUT /api/dashboard/referrals` valida el conjunto entero y que cada premio esté
en el catálogo ACTIVO de la marca; además, al otorgar, el premio se vuelve a leer filtrado por marca y activo.

## 8. Pruebas

- `tests/db/referidos-base.test.ts` (21) — la 00075 sola: FK compuesta entre marcas, unicidad, `completar_referido()` con
  seis llamadas simultáneas y dos transacciones intercaladas, el tope con cuatro amigos a la vez, el mes pasado, el vencido,
  los índices de `reward_grants`, los permisos.
- `tests/db/referidos-flujo.test.ts` (20) — las rutas REALES sobre Postgres con `resolveHostContext()` de verdad: registro
  pendiente con su regalo, premio solo al escanear y una vez con cuatro escaneos a la vez, auto-referencia, ya cliente, ya
  referido, tope, vencimiento, marca apagada sin cambios, el código de A en B, dos sedes (enlace, 409, canje en la otra
  sede), una sede, puntos, la lista del mesero, fallo de base = 500.
- `tests/db/referidos-panel.test.ts` (10) — el panel con sesión real: premio de otra marca → 400, administrador de sede →
  403, la puerta de atrás de `settings`, los números, fallo de base = 500.
- `tests/unit/referidos-puro.test.ts` (33) — ajustes, validación, código, mensaje, dominio del enlace, `urlDeLaSede()`.

Contra el código anterior (`ca47afc`): caen los 84 (sin la 00075 los 21 de la base fallan; los otros 63 no cargan porque sus
módulos no existían). Restaurando solo la ruta del check-in, `settings-keys` y `grantReward()` viejos (con lo nuevo
presente): caen 21 de 63 —los del registro, el escaneo, el tope, el vencimiento, la lista del mesero y la lista cerrada—.

## 9. Lo que queda (en `docs/PENDIENTES.md` S-6)

- **El aviso «¡Tu amigo vino, ganaste X!» por WhatsApp** a quien invita: necesita una plantilla nueva (aprobación de Meta) y
  cruza con B1 (menos aprobaciones por marca). Hoy quien invita lo ve en su tarjeta («✓ Vino · ganaste»).
- **«Trae a un amigo» dentro del flujo mensual** (S-6.2): es una pieza del motor del ciclo (`src/lib/communications/
  registry.ts`) y pide plantilla; no se tocó el ciclo.
- **Celebración en la tarjeta de quien invita** (confeti cuando su amigo es validado): el plan la quería; hoy el estado se
  ve al abrir la tarjeta.
- **El QR del enlace** para mostrarlo en persona (el plan lo listaba): el botón «Copiar» y WhatsApp cubren el caso de hoy.
- El aviso de «recompensa faltante» (S-6.4) para referidos: la pantalla ya avisa si el premio elegido se retiró del catálogo
  (`SelectorDePremio`), pero nada avisa por fuera del panel.
