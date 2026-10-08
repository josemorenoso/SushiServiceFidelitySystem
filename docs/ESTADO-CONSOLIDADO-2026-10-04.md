# Estado consolidado — requerimientos de agosto × auditoría de 1000 clientes × cola del dueño — 2026-10-04

> ⚠️ **Desde el 2026-10-08 la lista única de lo pendiente es [`docs/PENDIENTES.md`](PENDIENTES.md)**: el orden de trabajo, la
> tercera pasada del ciclo y **todas las preguntas al dueño** (bloques A–D, que reemplazan a §7 y §10.5 de aquí). Este
> archivo queda como **inventario de detalle**: cada pedido de agosto, cada hallazgo de la auditoría y N1–N23 con su evidencia.
> Lo que §10 dice del spec del ciclo es de su primera pasada: hoy son **19 decisiones** (no 10), la plantilla nueva se llama
> **`gift_expiring` «Regalo que vence»** (no `invite_expiring`) y la pestaña «Premios» va a Recompensas si el dueño lo confirma.

> **Para qué sirve:** un solo lugar donde ver (1) cada cosa que el dueño pidió en agosto y si está hecha, (2) los 68 huecos
> que nombró la auditoría del 28-09 y cuáles ya se cerraron, (3) lo construido después que no estaba en ningún
> documento de requerimientos, (4) **la lista de requerimientos de septiembre del dueño, organizada (§10)**, y (5) con todo junto, **qué desarrollar primero**. Reemplaza a `docs/ESTADO-REQUERIMIENTOS.md`
> (del 06-09, desactualizado: daba por abiertas cosas hechas y por hechas cosas que no existen).
>
> **Fuentes:** `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` (§0–§25) · `docs/AUDITORIA-ESCALA-1000-2026-09-28.md`
> (+ §6–§8) · `ESTADO.md` (§3 cola, §5 hecho reciente) · `CHANGELOG.md` desde el 28-08 · `docs/PENDIENTES-PLANTILLAS.md`.
>
> **Cómo se hizo (método §9, «Una auditoría»):** diez auditores de solo lectura (8 Sonnet, 2 Haiku) — uno por bloque de
> secciones del documento de agosto, cuatro por tema de la auditoría y uno para el inventario cronológico del CHANGELOG —
> verificaron **cada pedido contra el código** de `feat/multisede-aios` (`HEAD 868f7ec`), no contra lo que dicen los docs.
> Cada veredicto lleva su evidencia `ruta:línea`; aquí va condensada (una referencia por fila que no está hecha).
> **No se tocó código, no se corrió vitest ni tsc, no se consultó producción.** Lo que depende de la base real o de la
> consola de Vercel, Meta, Zernio o Twilio dice `NO VERIFICADO`. Fuera de alcance: `REQUERIMIENTOS_JULIO_2026.md` y
> `REQUERIMIENTOS_SISTEMA.md` (trabajo más viejo; se pueden sumar si hace falta).
>
> **Estado de despliegue (actualizado el 04-10 por la tarde):** `main` y `feat/multisede-aios` son **la misma historia** (merge
> `c41da76`). En producción están la ola 0, **ESCALA-3/4 con su hotfix** (el primer deploy, `9a06670`, dio 500 en la analítica de
> las 5 marcas y se revirtió unas horas con un rollback de Vercel; el hotfix `ff9fd90` se promovió a mano), el **cumpleaños dos
> días antes** (código; falta crear la plantilla nueva en cada marca) y las plantillas del 02-10 (`9514c2b`, `0b4ec8e`).
> **La migración 00069 sigue SIN aplicar.** Las demás migraciones están aplicadas (dueño, 2026-09-29).
>
> **Leyenda:** ✅ hecho · 🟡 parcial · ⬜ no empezado · ⏸️ diferido a propósito · 🔁 reemplazado u obsoleto (el dueño cambió de
> idea o ya no aplica) · ❓ pregunta abierta al dueño.

---

## 0. En una pantalla

| Qué se midió | El número |
|---|---|
| **Pedidos de agosto** (§0–§25, extraídos uno por uno) | **224** → ✅ 90 hechos (40 %) · 🟡 42 parciales · ⬜ 35 sin empezar · ⏸️ 12 diferidos a propósito · 🔁 20 reemplazados u obsoletos · ❓ **25 preguntas abiertas al dueño** |
| **Auditoría del 28-09** (los 68 hallazgos, hoy) | 14 cerrados (8 en código desplegado · 3 por docs · 3 en código a la espera de una acción del dueño) · 7 parciales · 1 refutado · 1 no verificable · **45 abiertos, 13 de ellos críticos** |
| **Cola de `ESTADO.md` §3** | 31 ítems: **29 piden algo del dueño** (26 solo suyo, 3 mixtos) · 2 son código puro |
| **Hallazgos nuevos** (ni agosto ni la auditoría los vieron) | 23 → 2 críticos · 9 altos (§5) |
| **Documentos que se contradicen o mienten** | 16 puntos (§8) |
| **Tu lista de septiembre** (§10; texto completo en el Anexo A) | 56 filas: 8 notas de contexto · 18 pedidos del flujo y el ciclo (**12 ya diseñados en el spec del ciclo, 5 en parte**) · 30 de las 7 tareas · **13 preguntas nuevas** · **1 choque con el spec** (la pestaña «Premios») |

**Lo que hay que saber, en nueve líneas**

1. **Lo que se vende hoy está hecho y en producción:** QR, tarjeta con la marca, plantillas editables, sedes con permisos, escáner de
   meseros, domicilios, Golden Bullet, invitaciones con premio. Lo «sin empezar» (35) es **catálogo** —referidos, push, fatiga, tier
   máximo, multi-sede «por dentro»—, no deuda técnica.
2. **Hay dos agujeros entre marcas VIVOS hoy** (AISLA-2 y OPUS-4): el código que los cierra (la **00069**) está escrito y **sin aplicar**.
   Es un gesto del dueño de cinco minutos y es lo primero de todo. Además hay dos cosas por mirar: si los registros del Supabase
   del AIOS están abiertos (N2) y si la 00030 corrió.
3. **25 preguntas abiertas frenan trabajo que ninguna sesión puede empezar sola** (§7): referidos, push, fatiga, Black, tier máximo,
   franquicias y —la que más desbloquea— **a dónde llega el aviso diario**.
4. **De la auditoría se cerró lo urgente** (ola 0, ESCALA-3/4 —el primer deploy dio 500 en la analítica y se corrigió con un hotfix el mismo día—,
   la 00064, el texto de 24-72 h, la unión de `main` con la rama). **Todo lo de rastrear, implementar y escalar
   sigue abierto**: dar de alta una marca son 14 acciones manuales, y si algo falla no avisa a nadie.
5. **El mismo hueco aparece dos veces** (§4): plantillas, «nadie se entera», fatiga y duplicado, el alta. Conviene atacarlos
   **una vez, como ola**, no como ítems sueltos.
6. **Lo que ni agosto ni la auditoría vieron** (§5): el consentimiento (Ley 1581: el CSV del dashboard y los domicilios crean clientes
   «consentidos»), un envío fallido que bloquea el reintento 30 o 360 días, rutas de plantillas sin guardia de rol de marca, y la rama de
   botones del webhook de Zernio que aún espera antes de contestar.
7. **Los docs mienten en 16 puntos** (§8) y `ESTADO.md` mide 587 líneas (límite 150). Este archivo reemplaza a `ESTADO-REQUERIMIENTOS.md`.
8. **Tu lista de septiembre (§10):** el flujo de campañas y el ciclo de 90 días —el «principal»— **ya tiene un spec** de otra sesión
   (`docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md`, solo diseño, con 10 decisiones tuyas por defecto). Lo que **no**
   cubre son tus tareas 1 a 7, y en la 1 **choca**: él deja «Premios» dentro de Campañas y tú lo quieres en Recompensas. Verificado contra
   el código: tu sospecha sobre el pop-up de reseñas es **cierta a medias**, y la pantalla posterior al escaneo **no se puede borrar sin
   antes reubicar la elección de premio / Mystery Box**.
9. **Propuesta (§9):** P0 gestos del dueño (hoy) → P1 cierres micro + CI → **P2 plantillas y recompensas ∥ P5 el ciclo** → P9 tarjeta, reseñas y
   referidos → P3 ver y avisar → P4 el alta sin cuello humano → P6 escala técnica → P7 proceso → P8 catálogo. **El orden lo decide el dueño.**

---

## 1. Requerimientos de agosto, sección por sección

> «Depende de» usa: **D** = decisión o gesto del dueño · **C** = código · **M** = migración · **T** = tercero (Meta, Zernio,
> Twilio, Firebase). Tamaño de lo que falta: micro (< 1 h) · feature (una sesión) · ola (varias sesiones).

### §0 Contexto · §1 Migración Twilio → Zernio · §2 Arquitectura · §10 Housekeeping

| ID | Pedido | | Qué falta / nota | Depende |
|---|---|---|---|---|
| §0.2 | Mismo Supabase multitenant; Twilio y Zernio conviven | ✅ | `00036`, ruteo en `whatsapp.service.ts:388` | |
| §0.3 | Los tenants Twilio pasan a Zernio de a uno, sin fecha | 🟡 | Sushi Service en «puente doble» (`712ff58`); el resto sigue en Twilio por defecto (proveedor real por marca: NO VERIFICADO). La SIM de Twilio de Sushi Service muere ~2026-10-12 | D · ola |
| §0.5 | ¿Los profiles de Cada1 van al Team compartido de Zernio o a uno dedicado? | ❓ | Sin decisión registrada; la factura de Zernio se mezcla con el otro proyecto (`ESTADO.md:243`) | D |
| §0.1, §0.4 | Repo y Vercel nuevos · ignorar `Upgrading.md` | 🔁 | Un solo deploy sirve a los dos proveedores; `Upgrading.md` terminó siendo el AIOS (§11) | |
| §1.1 · 1.2 · 1.5 · 1.9 · 1.11 | Convivencia Twilio/Zernio por tenant · `templateParams` · resolver tenant por `accountId` · `assertEventTemplateUsable` · `validate-env` | ✅ | | |
| §1.4 | Webhook entrante con firma, 2xx en < 5 s | ✅ | Responde antes de la IA (ESCALA-3; estuvo revertida unas horas el 10-04 y volvió con el hotfix `ff9fd90`). **NO VERIFICADO:** el nombre real del header de firma (`x-zernio-signature` o `x-late-signature`) — falta un entrante real | D |
| §1.7 | Gestión de plantillas del dashboard sobre Zernio | ✅ | «Activar» las aprobadas (`0b4ec8e`) y el timeout de 10 s al crear con foto (`9514c2b`), **desplegados el 10-04** (merge `c41da76`) | |
| §1.3 | Mapear cada `ContentSid` a plantilla Zernio | 🟡 | Faltan `tier_unlocked` y `reward_reminder` en el catálogo: **en Zernio, subir de nivel y el recordatorio de premio no mandan nada** (`check-in/route.ts:995`, `reward-reminder/route.ts:71`) → §12 / OPER-5 | C+T · micro |
| §1.8 | `twilio-balance`/`twilio-metrics` con equivalente Zernio | 🟡 | El panel de entregabilidad sigue siendo solo Twilio (`dashboard/page.tsx:99`) | C · feature |
| §1.13 | Probar el envío de punta a punta con un número real | 🟡 | Hay envíos reales indirectos («193 en un día en una marca»); la prueba controlada (`zernio-sandbox-test.mjs --to <su celular>`) no está hecha | D |
| §1.14 | Opt-out por error 131026/131050, límites, media en conversación | 🟡 | Texto libre en ventana de 24 h sí; opt-out por `message.failed` no está implementado | C · micro |
| §1.15 | El cliente compra su línea y queda conectada sin trámite manual | 🟡 | El wizard del AIOS cubre el camino (perfil, cotizar/comprar, Embedded Signup, Cloud API, plantillas, webhook, activar). La **compra real nunca se ejecutó**; lo real es coexistencia con número propio; Meta tarda 24-72 h | D+T · ola |
| §1.16 | Onboarding de los 25 clientes en Zernio (deadline ~2026-09-10) | 🟡 | Herramienta construida; hay 5 marcas vivas + 3 en alta (Planeta Wings, Tepuy, Pedacito). **El deadline venció; faltan ~20 marcas** | D · ola |
| §1.6 · 1.10 | Traducir el payload para n8n · alta sin scripts `twilio-setup*` | 🔁 | Los domicilios se procesan dentro del producto; el wizard del AIOS reemplazó los scripts | |
| §1.12 | Renombrar `twilio_sid` / `twilio_subaccount_*` | ⏸️ | No se renombra: guarda el `messageId` de Zernio | |
| §2.2 | Retomar Sushi Fun al multitenant | ✅ | Absorbida el 09-06 (1.421 filas). Falta borrar su Supabase viejo (gesto, fin de semana tranquilo) | D |
| §2.1 | ¿Qué es «Sushi Service Barra»: sede o marca? | ❓ | No existe en el código ni en las 5 marcas vivas | D · micro |
| §2.3 · §10.2 | `01-project-overview.md` y `02-architecture.md` siguen en «un clon por cliente» | ⬜ | Reescribirlos (el ADR-005 no tiene enmienda) | C (docs) · micro |
| §10.1 · 10.3 · 10.4 | WIP de v2.8.x · `DB_SCHEMA.md` · carpeta «Landing Page» | ✅ | `2381fa0`, `DB_SCHEMA.md:1048`, `4e88cf2` | |
| §10.5 | `package.json` dice 0.1.0 mientras el producto va en v2.x | ⬜ | Cosmético | C · micro |

### §3 QR · §4 Referidos · §5 Pantalla del teléfono y tarjeta · §6 Branding · §7 Calendario · §8 Puntos · §9 Push

| ID | Pedido | | Qué falta / nota | Depende |
|---|---|---|---|---|
| §3.4 · 3.5 | Menú «QR Studio» · QR de la tarjeta con color de marca y logo | ✅ | `CustomerCard.tsx:215`, `DashboardSidebar.tsx:47` | |
| §3.2 | QR de mesa más personalizable (módulos, marco con CTA, fondo) | ⏸️ | `qr-studio.md:37`: «rediseño fuera de alcance hasta que el dueño lo defina»; hoy es una sede, un QR, SVG/PNG | D · feature |
| §3.1 · 3.3 | ¿«QR básico» es el Studio o el de la tarjeta? · persistir la config del Studio | 🔁 | Se hizo la tarjeta; la persistencia (`config.qr_studio`) quedó lista pero `qr/page.tsx` ya no la usa | |
| §3.6 | QR de la tarjeta con tamaño/opciones | ⬜ | `size={210}` fijo; pedido implícito | D · micro |
| §4.6 · 4.8 | Referido entra pendiente del mesero con su premio · QR de campaña con premio | ✅ | Es la **invitación con premio** (00063): `/c/{slug}`, `reward_grant source='invite'` | |
| §4.1 | **Programa de referidos**: el cliente trae un amigo y ambos ganan | ⬜ | Cero schema y cero endpoints (`referral-program.md:3`). Se «para encima» de las invitaciones | D+C+M+T · ola |
| §4.2 · 4.3 · 4.4 | Códigos referidor↔referido · enlace `/r/{código}` y compartir por WhatsApp · botón «Gánate X» en tarjeta y éxito | ⬜ | No existe nada | C+M · feature |
| §4.7 · 4.9 · 4.10 · 4.11 | Premio al REFERIDOR + aviso · reglas (una vez por teléfono, sin auto-referencia, tope, expiración) · `/dashboard/referidos` con métricas · plantillas `referral_*` | ⬜ | La invitación premia solo a quien se registra | C+M+T · feature |
| §4.5 | Landing pública del referido con el nombre de quien lo trae | 🟡 | `/c/[slug]` existe, sin personalizar | C · micro |
| §4.12 · 4.13 | Recompensa por defecto (puntos o producto) · ¿permitir referir con check-in «auto»? | ❓ | `referral-program.md:179` propone que NO | D |
| §5.1 – 5.5 | Pantalla y tarjeta con la piel de la marca, editable por el dueño, logo persistente | ✅ | `--brand-*` en `globals.css`, `/dashboard/marca`, bucket `brand-assets` | |
| §5.6 | Textos fijos editables por marca («Bienvenido», «¡Hola, {name}!») | ⏸️ | `identidad-visual.md:262`: «No» (multiplica el QA) | D |
| §5.7 | Nombre de marca y etiqueta de staff editables por el dueño | ⬜ | `brand_name` fuera de la whitelist a propósito; solo el AIOS lo siembra | D · micro |
| §6.1 | Tokens de color en `tenants.config` en vez de dos strings | ✅ | Es una pantalla (`/dashboard/marca`), no un wizard | |
| §6.2 | Logo y paleta capturados en el ALTA | 🟡 | El alta del AIOS manda nombres, redes y `card_bg/page_bg`; no logo ni `branding.primary` (`provisioning.ts:1347`) | C (AIOS) · micro |
| §6.4 | Generar plantillas desde el branding | 🟡 | Librería fija de 13 textos con `${brandName}`/`${emoji}`; el AIOS las crea en Zernio; Twilio sigue manual | T |
| §6.5 | Logo reutilizado en los mensajes de WhatsApp | 🟡 | Persistido y usado en pantallas; ningún emisor de WhatsApp lo lleva | D+T · feature |
| §6.3 | «Tono» por tenant (cariñoso vs elegante) | 🔁 | El dueño lo descartó el 09-10: «siempre cálido» | |
| §7.1 | El mensaje de evento deja de ser «noche especial… con tu familia» | 🟡 | Marco neutro para Zernio (`99bee83`, `74a85d6`); las 4 marcas Twilio viejas conservan el cuerpo viejo | D+T · micro |
| §7.4 | Plantilla de imagen aprobada propia por cada tenant | 🟡 | AIOS las crea en Zernio; en Twilio las crea el dueño a mano (2 rechazos). **NO VERIFICADO** en Meta | D+T |
| §7.2 · 7.3 | Variantes por `event_type`/franja horaria · `content_sid` por tipo | 🔁 | «El que decide qué mensaje contiene es el cliente»: marco único a propósito | |
| §8.2 | Corregir el fallback `?? 150` al superar el tier máximo | ⬜ | `points.service.ts:191` intacto; con saldo mayor que todos los niveles sigue dando puntos sin fin. **Bug micro e independiente** | C · micro |
| §8.1 | ¿Qué pasa al superar el tier máximo (prestige, tiers ilimitados)? | ❓ | Sin diseño | D · feature |
| §8.3 | Mensaje de «nivel máximo alcanzado» | 🟡 | La tarjeta ya lo dice; las APIs y los mensajes de WhatsApp siguen mudos | C · micro |
| §9.1 | Notificaciones push (FCM) | ⬜ | Cero infraestructura (sin service worker, manifest ni Firebase) | D+C+M+T · ola |
| §9.2 – 9.5 | ¿Cliente o staff? · ¿qué caso justifica push además de WhatsApp? · ¿romper el check-in stateless? · ¿un Firebase o uno por cliente? | ❓ | `AUDITORIA_VENTAS_COMPETENCIA` argumenta que en Colombia WhatsApp gana a push | D |

### §11 AIOS · §21 Panel del AIOS · §22 Franquicias

| ID | Pedido | | Qué falta / nota | Depende |
|---|---|---|---|---|
| §11.1 – 11.5 | CRM mínimo: dar de alta clientes, verlos, cuándo deben pagar, datos adicionales, el panel crea el tenant en el producto | ✅ | AIOS v1.13.2; `siteCreateTenant` → `aios_provision_tenant` | |
| §11.9 – 11.14 | Proyecto separado · rol restringido · stack · flujo real de alta · 00001/00035 aplicadas | ✅ | Deriva: `aios_delete_tenant` borra comensales (tope 100); la **00009 del AIOS sigue sin confirmar** | D (confirmar) |
| §11.6 | El panel aprovisiona el número en Zernio | 🟡 | Camino completo construido; compra real nunca ejecutada; las altas reales son por coexistencia | D+T |
| §11.7 | Fase 2: automatizar plantillas **y branding visual** | 🟡 | Plantillas sí (con su copia propia del catálogo, ver §12); logo y paleta no | C · feature |
| §11.8 | Fase 3: el restaurante se auto-registra | ⏸️ | «No v1» | D+C · ola |
| §11.12 | API key de Zernio | 🔁 | Compartida el 08-30; la de `.env.local` da 401; **la vigente en Vercel: NO VERIFICADO** | D |
| §21.2 · 21.3a | Créditos de mensajes a primera vista · cobro por propietario ahí mismo | ✅ | `OverviewTiles.tsx:69`, `billing_mode` | |
| §21.1 | Filtrar los que usan Twilio o están en otro Supabase | 🟡 | La lista ya parte Twilio / Zernio; no hay filtro «externo» (casi irrelevante: Sushi Fun ya no es externo) | C · micro |
| §21.3b | Con varias sedes y pago a propietario, ver cuál consumió qué | 🟡 | La bolsa se cuenta por MARCA; todas las sedes de un grupo muestran la misma | M+C · feature |
| §21.4 | Pasar Frangal y las sedes de cortesía a «Sin WhatsApp» | ❓ | Es un dato de la base del AIOS | D · micro |
| §22.0 · 22.6 | No cerrar la puerta a franquicias · ¿quién paga? | ✅ | `site_model = single/group/franchise` (AIOS 00009); `per_site`/`consolidated` | |
| §22.1 · 22.4 | Nivel «marca» sobre franquiciados · levantar `idx_tenants_zernio_account_id` | ⬜ | Solo si el dueño lo activa (§22 dice «NO es v1») | M+C · feature |
| §22.3 · 22.5 · 22.7 | ¿Un número por propietario o por marca? · ¿puntos de la marca o de la sede? · ¿quién edita las plantillas? | ❓ | | D |
| §22.2 | Plantillas por franquiciado | ⏸️ | Restricción, no tarea: el nombre va horneado | |

### §12 Plantillas · §13 Campañas · §14 Dashboard · §15 Campañas usabilidad · §16 Fatiga y pipeline · §17 Black/VIP

| ID | Pedido | | Qué falta / nota | Depende |
|---|---|---|---|---|
| §12.2 · 12.4 · 12.5 · R2 · R3 · R6 · P1a | Tono cálido por defecto · editar como documento (crea nueva, no deja hueco) · pantalla nueva · un solo estilo · aviso de responsabilidad · solo tenants Zernio · la vieja sigue hasta que apruebe la nueva | ✅ | `template.service.ts:504-532, 944-990`. **NO VERIFICADO:** que el evento `whatsapp.template.status_updated` esté suscrito en Zernio | T |
| §12.1 | Un solo set base de 13 plantillas para todo tenant nuevo | 🟡 | **Hoy son DOS catálogos** (producto y copia del AIOS), sin test que los compare y ya con deriva → OPER-6 | C · ola |
| §12.P1c | Si Meta rechaza: la vieja sigue y se avisa al dueño | 🟡 | La vieja sigue; el aviso es solo en pantalla, con el motivo crudo | C · micro |
| §12.P1d | Qué hacer si Meta PAUSA una plantilla vigente | ⬜ | Solo `console.warn` (`template.service.ts:1018`) | D+C · micro |
| §12.P1b | Borrar la plantilla vieja al aprobarse la nueva | ⏸️ | Zernio no expone DELETE; solo se marca `retired` | T |
| §12.R5b | Generar textos con un LLM «luego» | ⏸️ | Prompt P4 pendiente | D · feature |
| §12.3 · R4 · R5a | Estilos elegante y urbano · re-aplicar estilo al catálogo · banco de 26 textos | 🔁 | El dueño los quitó el 09-10: «siempre cálido» (`948b955`). Hoy 1 estilo × 13 textos | |
| **Rediseño de plantillas** (`PENDIENTES-PLANTILLAS.md`, dueño 09-12: «sistema altamente mediocre… urgente») | Ocho pasos: un solo libro mayor · cubrir `tier_unlocked`/`reward_reminder` · una pantalla para los dos proveedores · 13 → 8 · probar UTILITY · rechazos/pausas con salida · mostrar lo que no salió · borrar el doc viejo | ⬜ | **0 de 8 completos** (el paso 1 mitigado con «Activar», sin desplegar; el 3 parcial). Las 9 fallas siguen abiertas | C · ola |
| §13.1 | Modificar el apartado de Campañas | 🔁 | Sin alcance propio: lo absorbieron §15 y §16 | |
| §14.1 · 14.2 | Sacar la sección Black del dashboard principal · resumen de 20 a 15 | ✅ | `f1a7921` | |
| §15.3 | Mover las burbujas flotantes a Campañas | ✅ | | |
| §15.1 · 15.a | Rediseño de usabilidad «que entiendan estúpidamente fácil» · ¿es la pantalla o el modelo mental? | 🟡 ❓ | Hay estructura nueva (pestañas, banner, cupo, radar), pero el rediseño de fondo nunca se hizo. Copy desactualizada: dice «cumplen años hoy» (ya es 2 días antes), «8:00 AM» (es 13:00 Bogotá) y «toque al día 21 y 25» (el dedupe real es de 30 días) | D · feature |
| §15.2 · 15.b | Presets fantasma `invite_restaurant`/`invite_delivery`: borrar o completar | 🟡 ❓ | De facto se eligió completar: se ocultan hasta que su plantilla esté aprobada. Falta la decisión formal | D · micro |
| §16.1 · D-10.a | «6 comunicaciones sin que vuelva → sale de la lista hasta que escanee» (pausa, no opt-out) | ⬜ | Cero código: ni contador, ni estado «fatigado», ni reingreso | D+M+C · feature |
| §16.2a | Separar mejor la reactivación suave y la agresiva | 🟡 | Los días son configurables por marca. **Hallazgo:** la agresiva no tiene tope y se repite cada ~30 días sin fin (`reactivation/route.ts:160-243`) — es la fatiga que §16.1 quería evitar | D · micro |
| §16.2b · 2c · 2e · §16.3 | Etapa final del pipeline · pipeline como máquina de estados · estado terminal con reingreso por escaneo · spec propio (Bloque 7) | ⬜ | No hay spec en `docs/superpowers/specs/` | D+M+C · ola |
| §16.2d | Un QR o domicilio reinicia el recorrido | 🟡 | Implícito: `last_visit_at` saca al cliente del pool; el contador de fatiga no existe | C · micro (con 16.1) |
| §16.a – e | Etapas y días · qué cuenta en las 6 · reinicio por tiempo · «escanear» incluye domicilio · backfill | ❓ | Cinco preguntas abiertas | D |
| §17.1 · 17.2 | Black se muda a Clientes · tarjeta negra y dorada | ✅ | `WalletCard.tsx:58`. **NO VERIFICADO:** que cada marca tenga un nivel `is_black` | D (gesto) |
| §17.1b | La lista Black debe mostrar a TODOS los Black | 🟡 | Recibe solo los 15 de más visitas: una marca con > 15 Black pierde al resto (`BlackTierSection.tsx:24`) | C · micro |
| §17.3 | Beneficio permanente al llegar a Black | 🟡 | `black_benefits` es texto libre; el default «15 % permanente» no lo aplica ningún código | D+M+C · feature |
| §17.4 · 17.b | Definir desde el dashboard las visitas/puntos para Black · ¿visitas, puntos o ambos? | 🟡 ❓ | **Sigue partido:** la tarjeta usa puntos, el panel usa 10+ visitas (`rankings.ts:2`), y hay una tercera noción (`rewards.is_black`) | D · feature |
| §17.a · c · d | Qué es el beneficio · si se cae de Black · si hay tier superior | ❓ | | D |

### §18 Domicilios · §19 Escáner QR de meseros · §20 Decisiones D-7 a D-10

| ID | Pedido | | Qué falta / nota | Depende |
|---|---|---|---|---|
| §18.a · 18.b · 18.d · 18.e | El cuadro entra por WhatsApp · `authorized_numbers` basta · apartado de Domicilios · apagar la auto-respuesta por tenant | ✅ | **§18.e está hecha** (`connection.service.ts:32`, `ce5d249`) aunque `ESTADO.md` §3 y los docs viejos la dan por abierta. Nace PRENDIDA; solo la opera el super-admin mientras `owner_email` esté vacío | D (gesto) |
| §18.c | ¿Qué se le responde al operador cuando la marca es Zernio? | ⬜ | `webhook/zernio` no confirma ni avisa fallo. **Ya no hace falta plantilla** (texto libre en la ventana de 24 h): falta el texto y una llamada | D (texto)+C · micro |
| §18.a-C | Formulario de carga de pedidos en el dashboard | ⏸️ | El dueño pidió no construirlo a medias (09-07) | D |
| §19.1 · 19.3 – 19.7 · 19.10 · a–d | Un login por celular · nota de quién es · elegir mesero en cada escaneo · métrica por mesero · «Entregar» o «Guardar» · quién redime y mesa · la atribución del escaneo NO se protege con PIN | ✅ | `device/register/route.ts`, `check-in/route.ts:277`, `/dashboard/rendimiento`. Con los meseros vivos en `location_id` NULL **no salen en ningún escáner** hasta asignarles sede o «Rota» (gesto) | D (gesto) |
| §19.2 · 19.8 · 19.9 · 19.e | Alta de mesero con PIN · PIN al redimir · activarlo/desactivarlo · intentos de PIN | 🔁 | El dueño quitó el PIN del mesero el 2026-09-05 y aceptó el riesgo por escrito. Residual: el PIN del supervisor en `device/register` no tiene límite de intentos | C · micro |
| Handoff | Gobernanza de envío: sus bloques 1-4 son prerrequisito de las altas | 🟡 | Bloques 1, 2, 3 y 5 hechos; **el 4 (consentimiento) está abierto** → D-8/D-9 | C+M · feature |
| Handoff D-2 | Apagar el débito de billetera a tenants Zernio; suscripción mensual variable | 🟡 | El débito está apagado; el cobro por suscripción no existe en el producto (¿vive en el AIOS? NO VERIFICADO) | D · feature |
| D-7.a · D-7.b | Golden Bullet: divisor de bloques, techo = presupuesto de campaña completo | ✅ | `planBlocks()`, 00060; `golden_bullet_pct` nunca existió | |
| D-7.c | Puerta de calidad, frase escrita y congelar al primer amarillo | 🟡 | La puerta y la frase existen; **los ítems ya encolados no se frenan al primer amarillo** (el amarillo exige 2 lecturas y solo aprieta) | C · micro |
| D-8.a · D-8.b | Backfill de `consent_events` por periodo (corte 2026-05-10) · contar clientes anteriores por marca | ⬜ ❓ | La tabla existe y **nada la puebla**; la consulta de conteo está escrita pero sin resultado | D+M · micro |
| D-9.a | El formulario, el mesero y el alta manual SÍ cuentan como consentimiento | ✅ | `check-in/route.ts:552` | |
| D-9.b | Registrar cada alta en `consent_events` (`checkin_qr`/`staff`/`manual`) | ⬜ | El único INSERT es el del botón «sí» de Golden Bullet | C · feature |
| D-9.c · D-9.d | La importación NO cuenta nunca · ¿un domicilio cuenta como consentimiento? | 🟡 ❓ | **Agujero:** el «Importar CSV» del dashboard crea clientes con `accepts_marketing: true` (`customers/page.tsx:159`); los domicilios nacen consentidos por el default de `createCustomer` | D+C · micro |
| D-10.b | ¿«Escanear» incluye pedir domicilio? | ❓ | Bloquea el reinicio del contador de §16 | D |

### §23 Un cliente, varias sedes · §24 n8n visible y domicilios auditables · §25 Migración n8n → Vercel

| ID | Pedido | | Qué falta / nota | Depende |
|---|---|---|---|---|
| §23-F1 · F2 · F3 · F4 · F5a · F7 · F8 | Sede como entidad · columnas de sede en eventos · resolver sede por host · mesero de una sede · domicilios por celular del operador · permisos por sede · el AIOS agrega sedes sin crear marca | ✅ | 00041-00046, 00056; `location-scope.ts`. La base y el control de acceso están hechos | |
| §23-D1 · D5 · D7 · D10 · D11 · D21 | Subdominio y QR por sede · ficha de Google por sede · mismos precios · admin que ve todo y cada sede con su clave · mesero de una sede (enmendado: rotativos, 00062) · un subdominio por sede, raíz con 2+ sedes → 409 | ✅ | | |
| §23-F5b · F5c | Vista `customer_location_membership` · partir crons, campañas y eventos por sede (`is_home`) y panel «fuga entre sedes» | ⬜ | **0 hits**: ningún cron lee `location_id` | M+C · feature |
| §23-F6a · F6b · F6c · D12 | Atribuir sede a cada mensaje masivo · desglose de billetera por sede (D4 «obligatorio») · matriz de premios ganado-en → entregado-en (conteos y tasas, nunca pesos) | ⬜ | Las columnas existen y **nadie las escribe**: `granted_location_id`, `redeemed_location_id`, `message_logs.location_id` (el trigger de débito no la copia). Los reportes devuelven siempre «Sin sede» | M+C · feature (×3) |
| §23-F6d | Dashboard filtrado por sede | 🟡 | Quedan 5 rutas sin cablear (`send-queue` GET, `check-in-override`, `campaigns/manual`, `imported-contacts/confirm`, `campaigns/run-auto`) | C · micro |
| §23-D2 · D3 · D4 | Origen del cliente · premio de una sede se reclama en otra · billetera de la marca con desglose | 🟡 | `origin_location_id` sin forma de corregirlo; sin atribución de costo (F6c); AIOS sí suma por marca | C+M |
| §23-D8 | Evento de calendario de marca o de una sede («vital») | 🟡 | Solo existe la columna `audience_scope`; ni filtro ni UI | M+C · feature |
| §23-D9 | Cada sede despacha su zona; teléfono de domicilios por sede | 🟡 | Operador→sede y `delivery_phone` por sede hechos; el auto-reply de WhatsApp usa solo el de la marca: ¿qué teléfono dar? | D · micro |
| §23-F10 · Reseña | Recuerdo de reseña por sede · ¿dos premios de reseña por cliente (uno por ficha)? | ⬜ ❓ | El candado de reseña sigue por cliente | D+M · feature |
| §23-F9 · D6 | Línea (`location_messaging`), cupo y plantillas por sede · ¿un número o uno por sede? | ⏸️ | D6 cerrada: N líneas por marca, la sede no obliga. **Tepuy pidió un celular por sede**; hoy comparten línea | D (cuando exista la 2ª línea) · ola |
| §23-riesgo | Separar, vender o franquiciar una sede | ⏸️ | «No hace falta verlo ahorita» | D |
| §24-A | Semáforo por sede de que el sistema funciona | ✅ | AIOS `/salud` (`aios_health()`). **Hay que abrirlo**: nadie recibe un aviso | |
| §24-B1 · B2 · B3 | Lista de lo que entró · alarma de silencio contra el historial de la marca · rastro del domicilio perdido en tabla | ✅ | `/dashboard/domicilios`, `delivery_intake_failures` (00053). Hueco residual de ESCALA-3: si la plataforma mata la función durante el trabajo diferido no queda fila | |
| §24-ALERTA | **Que alguien se entere SIN abrir el panel** | ⬜ | **Ningún emisor existe en ninguno de los dos repos** (ni correo, ni WhatsApp, ni Slack, ni Telegram) → RASTREO-1 | D (canal y destinatario)+C+T · feature |
| §24-A2 | Latido real de cada cron | 🟡 | La señal es el último mensaje enviado; un día sin cumpleañeros se ve igual que un cron caído → RASTREO-5 | M+C · feature |
| §24-P2 · P4 · P5 | ¿Quién recibe la alarma? · ¿apartado solo lectura o configurable? · ¿se oculta si la marca no usa domicilios? | ❓ 🟡 | | D · micro |
| §25-Fase1 · line-health · R4 | Los crons vuelven a `vercel.json` (6) · cadencia `*/15` | ✅ | `vercel.json:2-8`. «Corriendo»: NO VERIFICADO en logs. `reward-reminder` sigue en 16:00 UTC (11:00 Bogotá): decisión del dueño | D |
| §25-Fase2 | Domicilios dentro del producto (OpenAI directo) | ✅ | `delivery.service.ts:614`. **NO VERIFICADO:** `OPENAI_API_KEY` en Vercel y `delivery_default_city` de Sushi Service | D |
| §25-Fase1-off · R3 | Apagar los 5 Schedule Trigger de n8n · apagar el VPS | ❓ 🟡 | `ESTADO.md:23` dice «Apagado», `CLAUDE.md` dice «ACTIVO». **Falta que el dueño lo mire en la UI de n8n.** Lo único que el VPS sirve de verdad es Google Contactos (W3) | D (gesto) |
| §25-Fase3 | Google Contactos del cliente (OAuth) | ⏸️ | El diseño nuevo no existe; hoy es un no-op sin `N8N_GOOGLE_CONTACTS_WEBHOOK_URL` | D+T · ola |
| §25-horas | Copiar las expresiones UTC verbatim | 🔁 | Corregido: `0 18` y `0 20` UTC (= 13:00 y 15:00 Bogotá), `3b31b13` | |

---

## 2. Lo construido después de agosto que no estaba en ningún documento de requerimientos

> Del CHANGELOG (inventario del auditor Haiku, verificado contra `ESTADO.md` §5). Todas las migraciones están **aplicadas**
> (dueño, 09-29) salvo la 00069. «Sin desplegar» = está en la rama, no en `main`.

| Tema | Qué se entregó | Fecha / migración | Despliegue |
|---|---|---|---|
| **Multi-sede en manos del cliente** | `/dashboard/sedes` y `/dashboard/accesos` (altas, bajas, contraseña nueva) · recompensas por sede · copiar premios a una sede ya no regala premios · el subdominio de sede resuelve la marca en todo lo público · cada sede manda a reseñar SU ficha · asignar sede a varios meseros de una vez · autorizados de domicilio con sede · **meseros rotativos** | 09-08 → 09-11 · 00056, 00058, 00059, 00062 | ✅ |
| **Identidad visual** | Capa visual v3 (tarjeta, entrada, panel) · «Tarjeta principal» con símbolo de sello, contorno, redes, Google, descripción y políticas · QR Studio por sede | 09-06 → 09-08 · 00047 | ✅ |
| **Domicilios** | Rastro del domicilio perdido · `/dashboard/domicilios` (flujo en 4 pasos, lista, alarma de silencio) con pestaña **Autorizados** · interruptor «Domicilios por WhatsApp» en el AIOS · **domicilios por el auto-chat de la propia línea** (`message.sent`) | 09-07 → 09-25 · 00053, 00066, 00068 | ✅ |
| **Golden Bullet** | Bloques diarios · tandas desde el panel con la base entera guardada y pestaña «Bases» · plata a la vista · foto en el mensaje 1 · prueba a un celular · tres textos editables · botón de parar el goteo · sondeo de salud de línea que por fin escribe `messaging_daily_limit` · **difusión por Zernio con la marca todavía en Twilio** | 09-10 → 09-12 · 00060 | ✅ |
| **Meta** | Píxel + política de privacidad · API de Conversiones con celular hasheado SHA-256 (cada marca conecta el suyo) · **el píxel de Cada1 queda apagado por decisión (Ley 1581)** | 09-10 → 09-11 · 00061 | ✅ |
| **Premios y equipo** | **Invitaciones con premio** (`/c/{slug}`) · **Rendimiento del equipo** (escaneos, nuevos, frecuentes y premios por mesero; mesas) | 09-11 · 00063, 00065 | ✅ |
| **AIOS** | El alta distingue grupo de franquicia (v1.9.0) · el cliente nace con usuario · cambiar contraseña · borrar/reiniciar un alta rota, deshacer y recargar WhatsApp (v1.11.0) · Conexiones: el cliente conecta su WhatsApp · Zernio en paralelo con Twilio (v1.13.0) · tablero de salud · 24-72 h (v1.13.2) | 09-07 → 10-03 · 00054, 00056, 00064, 00067 | ✅ |
| **Calendario** | Hora de Bogotá, goteo por cola, enlace del evento, dominio cruzado simétrico | 09-06 · 00050, 00051 | ✅ |
| **Infraestructura y método** | Sushi Fun absorbido (1.421 filas) · 6 crons en `vercel.json` · Método Maestro v3 · fallo de base ≠ vacío (`db-failure.ts`, 23 sitios) | 09-04 → 09-07 | ✅ |
| **Seguridad** | **Ola 0:** `mystery-box/resolve` solo otorga lo que se ofrece · `PUT settings` con alcance de marca · `timingSafeEqual` · `logs-*.csv` ignorado · cierra toda `SECURITY DEFINER` a anon y borra las políticas de la 00015 | 10-03 · **00069** | ✅ código · **00069 sin aplicar** |
| **Escala** | **ESCALA-3** (Zernio contesta antes de la IA) y **ESCALA-4** (la analítica pagina de a 1.000) | 10-04 | ✅ `9a06670` + hotfix `ff9fd90`: el primer deploy dio 500 en la analítica de las 5 marcas (`LIKE` sobre una columna `date`) y se revirtió unas horas |
| **Cumpleaños** | El saludo sale dos días antes (`BIRTHDAY_LEAD_DAYS`) | 09-24 → 10-04 | ✅ **desplegado el 10-04** con una plantilla nueva («Cumpleaños — dos días antes»): cada marca pasa sola al aprobarse en Meta; hasta entonces sigue con «¡Feliz cumpleaños!» el día mismo |
| **Plantillas** | Nombre editable en Meta · **«Activar» las aprobadas y lista real de la WABA** · timeout de 10 s al crear con foto | 09-12 · 10-02 | ✅ (las del 10-02, desplegadas el 10-04) |

## 3. La auditoría del 28-09: los 68 hallazgos, hoy

> Verificado contra el código por cuatro auditores, empezando por lo que cambió desde el 28-09 (ola 0, ESCALA-3/4, docs
> del 29-09, AIOS v1.13.2). **No se fiaron de los §7 y §8 de la propia auditoría:** buscaron el arreglo y su test.
> **Hoy:** ✅ cerrado y desplegado · ⏳ cerrado en código, falta una acción del dueño · 🟡 parcial · 🔓 abierto · ❌ refutado ·
> ❓ no verificable sin la base real. Severidad original: 🔴 crítica · 🟠 alta · 🟡 media · ⚪ baja.

### 3.1 Seguridad y aislamiento entre marcas

| ID | Sev. | Hallazgo | Hoy | Qué falta | Quién |
|---|---|---|---|---|---|
| AISLA-1 | 🔴 | `mystery-box/resolve` regala premios sin límite y cruza marcas | ✅ | `getNivelOfrecido()` + límite de tasa (`e287817`, `resolve/route.ts:102`). **Residual:** dos `resolve` simultáneos (sin UNIQUE; el límite vive en memoria) → prompt SEG-2 ya escrito | C · micro |
| AISLA-2 | 🔴 | La 00067 y la 00057 dejaron EXECUTE a `anon` en funciones `SECURITY DEFINER` | ⏳ | **VIVO en producción hasta que el dueño pegue la 00069** en el SQL Editor del proyecto del PRODUCTO. El «(a) corrió sin error» del 03-10 es dicho, no probado | **D · 5 min** |
| OPUS-4 | 🔴 | Políticas `USING (true)` de la 00015 abren clientes y visitas a la anon key | ⏳ | La misma 00069; la consulta (2) dice si la 00015 llegó a pegarse | D |
| OPUS-2 | — | CSV de Zernio con el texto de los pedidos en la raíz | ⏳ | `logs-*.csv` ignorado (nunca se commiteó); el archivo de 1,7 MB **sigue en disco**: borrarlo | D |
| OPER-4 | 🟠 | `PUT /settings` escribe cualquier clave sin rol de marca | ✅ | Desplegado. Falta la lista cerrada de claves. **La misma deuda está en `templates/catalog/[key]` PUT, `submit` y `adopt`** (nuevo, §5) | C · micro |
| AISLA-5 | ⚪ | `webhook/delivery` compara el secreto con `!==` | ✅ | `timingSafeEqual` desplegado, **sin test**; el secreto sigue siendo uno para todas las marcas | C · micro |
| AISLA-8 | ⚪ | `getEvent()` y updates de `customer` por `id` sin `tenant_id` | 🔓 | Defensa en profundidad (los llamadores re-chequean) | C · micro |
| AISLA-7 | ⚪ | `.gitignore` del AIOS no cubre `.env.staging` | 🔓 | `.env.*` + `!.env.example` | C · micro |
| OPUS-1 | 🟡 | `.mcp.json` versionado sin `read_only` | 🔓 | **Peor de lo auditado:** apunta al proyecto REAL y trae 8 features (no 3). Agregar `read_only=true` | D/C · micro |
| ALTA-3 | 🔴 | El AIOS es de un solo usuario: la RLS deja a todo `authenticated` ver y escribir todo | 🔓 | Roles o allowlist en `requireUser()` + RLS por rol, antes de sumar un segundo operador. El dueño fijó «una sola persona» para v1 | C+M (AIOS) · feature |
| AISLA-3 | 🔴 | Sin MFA en el AIOS: una sesión robada resetea la contraseña de admin de cualquier marca | 🔓 | MFA (TOTP) + bitácora de cada `reset_password` | C+D · feature |

### 3.2 Escalar a 1000 marcas

| ID | Sev. | Hallazgo | Hoy | Qué falta | Quién |
|---|---|---|---|---|---|
| ESCALA-3 | 🔴 | Zernio espera a OpenAI antes de responder; 10 fallos apagan el webhook de TODAS las marcas | ✅ | `after()` (`bb177cd`), desplegada el 10-04 (estuvo revertida unas horas junto con ESCALA-4 y volvió con el hotfix). **Residual:** la rama de botones sí/no **sigue esperando a Zernio** antes del 200 (`webhook/zernio/route.ts:260`); y si la función muere en el trabajo diferido no queda fila | C · micro |
| ESCALA-4 | 🔴 | `getFullAnalytics()` truncado a 1.000 filas en silencio | ✅ | Pagina de a 1.000 (`bb177cd`). **Su primer deploy dio 500 en la analítica de TODAS las marcas** (`LIKE` sobre una columna `date`, error 42883): se revirtió, y el hotfix `4907512` (promovido como `ff9fd90`) cuenta los cumpleaños en memoria. **Residual:** con un 500 el panel muestra «0 clientes» sin aviso (el hook guarda el error, ninguna pantalla lo lee) | C · micro |
| ESCALA-1 | 🔴 | Crons diarios: todas las marcas a la vez, sin `maxDuration`, presupuesto ni cursor | 🔓 | **4 de 6** crons sin los tres (`birthday`, `reactivation`, `reward-reminder`, `calendar-dispatch`); `getActiveTenants()` no pagina y ante un error devuelve `[]` con `ok:true`. `line-health` recorre en serie sin presupuesto (nuevo) | C · ola |
| ESCALA-7 | 🔴 | Sin anti-duplicado atómico en `campaign_messages` | 🔓 | Ningún UNIQUE en las 69 migraciones; cinco caminos «leer → enviar → escribir». Dos corridas solapadas = el mismo WhatsApp dos veces | M+C · feature |
| ESCALA-6 | 🟠 | `queue-drain` chequea el opt-out uno por uno | 🔓 | Un `.in()` por tanda (`queue-drain/route.ts:403`) | C · micro |
| ESCALA-8 | 🟠 | Marca y sede por host cuestan 2-4 consultas por request | 🔓 | Caché corta entre requests (`tenant.ts:132`) | C · feature |
| ESCALA-9 (= AISLA-4) | 🟠 | El límite de tasa vive en la memoria de cada instancia | 🔓 | Límite compartido (Redis/Upstash) o Firewall de Vercel | C+T · feature |
| ESCALA-2 | 🟠 | Supabase del AIOS en Nano (ya dio Gateway Timeout); tier del producto sin documentar | ❓ | Mirar Project Settings → Compute and Disk | D · micro |
| ESCALA-10 | 🟡 | Políticas RLS sin `(select …)` | 🔓 | 0 usos en las 69 migraciones | M · feature |
| ESCALA-11 | 🟡 | Sin índices compuestos en `campaigns` y `campaign_messages` | 🔓 | Ninguno empieza por `tenant_id`; puede ir con el UNIQUE de ESCALA-7 | M · micro |
| ESCALA-5 | ⚪ | `middleware` sin renombrar a `proxy` (Next 16); matcher sin excluir `/api` | 🔓 | | C · micro |
| ESCALA-12 | ⚪ | `scalability-analysis.md` miente | ✅ | Banner OBSOLETO; el cuerpo conserva «60 s» y «¿se va a caer? No» | C (docs) · micro |

### 3.3 Rastrear: saber qué marca está enferma sin abrir logs

| ID | Sev. | Hallazgo | Hoy | Qué falta | Quién |
|---|---|---|---|---|---|
| RASTREO-1 (= OPER-2) | 🔴 | Cero canales de aviso en los dos repos | 🔓 | Un emisor (correo, WhatsApp o Telegram) y un job diario sobre `aios_health()`. Ni mailer, ni Sentry, ni cron en el AIOS | **D** (canal)+C · feature |
| RASTREO-2 | 🔴 | Twilio sin status callback: `message_logs.status` se queda en `sent` para siempre | 🔓 | Ruta firmada `twilio-status` + `statusCallback` en `messages.create()`. Hoy `aios_health()` subcuenta los fallos de toda marca Twilio | C · feature |
| RASTREO-3 | 🔴 | Plantilla rechazada o pausada: cero rastro | 🔓 | Persistir pausadas/rechazadas y mostrarlas en `/salud`. **Peor:** una marca dada de alta por el AIOS no deja rastro de ningún REJECTED ni PAUSED (`template.service.ts:962`) | C · feature |
| RASTREO-4 | 🔴 | Sin tracking de errores ni log drain | 🔓 | 435 `console.*` en 138 archivos; sin `instrumentation.ts` | **D** (Sentry o drain)+T · feature |
| RASTREO-5 | 🟠 | «El cron corrió» es un `MAX` global: una marca activa tapa 999 crons muertos | 🔓 | Tabla de corridas por cron y marca (M) | M+C · feature |
| RASTREO-7 | 🟠 | No hay bitácora de «quién cambió qué» | 🔓 | `audit_log` en settings, plantillas y `reset_password` | M+C · feature |
| RASTREO-12 | 🟡 | Firma de webhook inválida: rechazo sin una línea de log | 🔓 | `console.warn` con slug y motivo. El header de firma de Zernio sigue sin confirmar | C · micro |
| RASTREO-10 | 🟡 | Saldo bajo sin aviso (existe `low_balance_notified_at`, nadie lo escribe) | 🔓 | Emisor del aviso al cruzar el umbral | C+D · feature |
| RASTREO-8 · 9 | 🟡 | `/salud` sin refresco ni paginar · `aios_health()` recalcula 6 `LATERAL` por carga | 🔓 | Filtro «solo rojos y amarillos»; caché | C · micro |
| RASTREO-11 | ⚪ | `twilio-metrics` corta en 5×1.000 | 🟡 | Mitigado: un banner ámbar avisa | |
| RASTREO-6 | ⚪ | El CSV del 24 no era de Vercel sino de Zernio | 🔓 | Informativo; la causa de fondo es RASTREO-4 | |
| OPER-7 · OPER-8 | 🟠 | Gasto de OpenAI y de Zernio sin medir ni limitar por marca | 🔓 | Contador de tokens por tenant (`response.usage`); decidir el Team de Zernio (§0.5) y valorizar por marca | M+C+D · feature |
| OPER-10 | ⚪ | `04-deployment.md` §8 sin Zernio ni OpenAI | ✅ | Agregados; los totales siguen sin sus cifras reales | D |
| OPER-12 | ⚪ | `USD_TO_COP = 4200` redeclarada | 🔓 | `imported-contacts.service.ts:42`; también hornea tarifas y TRM `TwilioWallet.tsx:112` | C · micro |

### 3.4 Implementar: el alta y el AIOS

> **Pasos manuales del alta hoy: 14 acciones del operador** (12 siempre, 2 condicionales) **+ 1 oculta + 2 traspasos a mano
> + 2 esperas de terceros** (la auditoría contaba ~17; el AIOS no cambió el alta desde el 28-09, la diferencia es de criterio).
> Los traspasos: copiar el link de Embedded Signup al dueño del negocio, y copiar usuario y contraseña al cliente por
> WhatsApp. Las esperas: el cliente completa Meta, y Meta aprueba las 13 plantillas en 24-72 h. La oculta: cambiar a mano
> «¿Con qué manda WhatsApp?» a Zernio, porque la activación nunca pasa la sede de `pending` a `zernio` (§5).

| ID | Sev. | Hallazgo | Hoy | Qué falta | Quién |
|---|---|---|---|---|---|
| ALTA-1 | — | Sin la 00064 no se podía borrar ni reiniciar un alta rota | ✅ | Aplicada (dueño, 09-29) | |
| ALTA-7 | 🟠 | La UI prometía «Meta contesta en horas» | ✅ | AIOS v1.13.2. Residual: un comentario viejo en `database.types.ts:185` | |
| ALTA-4 | 🟠 | No hay tablero de altas: todo bloqueo cae en «Falta un paso» | 🔓 | Tablero por etapa (esperando Meta · esperando al cliente · con error · lista) con aviso a las 72 h | C · feature |
| ALTA-2 | 🟠 | El primer WhatsApp puede no salir sin que nadie se entere | 🔓 | `no_template_configured` viaja en el JSON y ninguna pantalla lo lee; caso real: Planeta Wings 02-10. «Activar» (`0b4ec8e`, desplegado el 10-04) lo resuelve a mano | C · feature |
| OPER-5 | 🟠 | `tier_unlocked` y `reward_reminder` fuera de los catálogos | 🔓 | En Zernio, subir de nivel y el recordatorio de premio **no mandan nada, nunca**. Decidir: 2 plantillas nuevas o fundir `tier_unlocked` en `points_earned_near` | D+C · feature |
| OPER-6 | 🟠 | Dos catálogos de 13 plantillas, copiados a mano, sin test que los compare | 🔓 | Ya hubo deriva (`{{2}}` de cumpleaños; el AIOS v1.14.0 la sincronizó a mano el 10-04, pero el mecanismo —una copia a mano— sigue). Fuente única (el AIOS llama al producto) o, mínimo, un test de paridad | C · ola (test: micro) |
| OPER-3 | 🟡 | `owner_email` vacío en las 5 marcas: Conexiones solo la opera el super-admin | 🟡 | Hacerlo obligatorio en el alta y un `UPDATE` de las 5 vivas. Que sigan vacías: ❓ | D+C · micro |
| ALTA-5 | 🟡 | No hay alta en lote | 🔓 | Decidir si hace falta antes de las 25 | D+C · feature |
| ALTA-6 | 🟡 | Tepuy nació como dos marcas; se rehízo con SQL sobre dos Supabase | 🟡 | La causa está cerrada (v1.6.0, rechaza un segundo tenant de la marca); sigue sin haber herramienta para fusionar o separar marcas | C · feature |
| ALTA-9 · OPER-9 | 🟡 | `PROCESO_VENTAS` y `DELEGACION_GUIDE` describen la arquitectura vieja | 🟡 | Se marcaron obsoletas las tareas 4-6, pero las 7, 8 y 10 siguen escritas contra un Supabase y una cuenta Twilio por cliente; precio contradictorio ($250.000 contra 89 y 149 mil). Reescribir contra el AIOS | D (precio)+C (docs) · feature |
| ALTA-11 | ⚪ | «Registrar webhook» se pide por propietario aunque es global al Team | 🔓 | Detectarlo y marcar el paso solo | C · micro |
| ALTA-12 | ⚪ | `seed-new-tenant.sql` enseñaba el `UPDATE auth.users` a mano | ✅ | Residual: aún manda agregar el dominio en Vercel por cliente (contra el wildcard único) | |
| ALTA-10 | — | «El alta no pide `owner_email`» | ❌ | Refutado: el campo existe y llega a `tenants.owner_email`; es opcional | |
| OPER-1 | 🔴 | El cobro es 100 % manual y nada suspende por mora | 🔓 | Pasarela (Wompi), regla de corte que llegue al producto y aviso de cobro. El cobro manual es el v1 que el dueño decidió | D (política)+C+T · ola |
| OPER-11 | ⚪ | Reactivar una línea frenada es siempre humano, a propósito | 🔓 | Falta el playbook escrito y un botón con motivo en el AIOS | D+C · micro |

### 3.5 Proceso, despliegue y método

| ID | Sev. | Hallazgo | Hoy | Qué falta | Quién |
|---|---|---|---|---|---|
| PROC-1 | 🔴 | Sin CI en ningún repo: un commit roto en `main` se despliega solo | 🔓 | Workflow con `tsc`, `lint` y `vitest` antes del deploy (el arnés usa Postgres embebido: hay que probarlo en CI). Sin `.github/`, sin pre-commit ni pre-push | C · feature |
| PROC-2 | 🔴 | Nadie sabe qué migración está aplicada | 🔓 | `check-migraciones-1-catalogo.sql` llega hasta la 00043 de 69; `schema_migrations` vacía | C · feature |
| PROC-3 | 🔴 | Sin staging: cada migración y smoke test son en producción | 🔓 | Supabase + Vercel preview donde se aplique primero | D+C+T · ola |
| PROC-4 | 🔴 | Todo cuelga de una persona | 🔓 | Hoy **29 de 31** ítems de la cola piden algo del dueño; 2 son código puro (§6) | D |
| PROC-5 · PROC-7 | 🟠 | El AIOS no tiene un solo test · ningún test ejercita un handler de cron | 🔓 | Tests de las acciones que escriben y de los crons | C · feature |
| PROC-8 | 🟡 | `main` y la rama divergen por un despliegue parcial | ✅ | Desde el merge `c41da76` (10-04) son la misma historia; un push de la rama vuelve a ser fast-forward | |
| PROC-9 | 🟡 | `ESTADO.md` a 3,9× su límite | 🔓 | **587 líneas** contra 150; `CLAUDE.md` 125 contra 100 | C (docs) · feature |
| PROC-6 | 🟡 | Worktree de Kilo suelto | 🔓 | `.kilo/worktrees/ivy-city` (detached `311bbe9`, sin fila en §2): borrarlo | D |
| PROC-10 | 🟡 | `graphify.exe` bloqueado por el Control de aplicaciones de Windows | 🟡 | El grafo funciona por `python -m graphify`; la salida de fondo es permitir el `.exe` | D |
| PROC-11 | ⚪ | Docs que mienten | 🟡 | Parte corregida el 29-09; ver §8 | C (docs) · micro |
| PROC-12 | ⚪ | vitest fija el puerto 55432 sin detectar otra corrida | 🔓 | El síntoma es «No test files found» | C · micro |

---

## 4. Un hueco, dos nombres: dónde agosto y la auditoría hablan de lo mismo

| Hueco | En agosto | En la auditoría | En la cola de `ESTADO.md` | Hoy |
|---|---|---|---|---|
| **Plantillas**: alta lenta, 13 aprobaciones por marca, silencio en subir de nivel | §12, §1.3, §6.4 | OPER-5, OPER-6, RASTREO-3, ALTA-2 | 0.PLANTILLAS | **0 de 8 pasos del rediseño**; las 9 fallas siguen abiertas |
| **«Nadie se entera»** | §24-A, §24-ALERTA, §24-A2 | RASTREO-1, 4, 5, 10, 12 | 0.DOMI (alarma solo se pinta) | Cero canales de aviso; todo es una pantalla que hay que abrir |
| **Fatiga y duplicado** | §16, D-10 | ESCALA-7 | — | §16 no empezado; la reactivación agresiva se repite cada ~30 días sin tope |
| **Consentimiento (Ley 1581)** | D-8, D-9 | **la auditoría no lo miró** | — | Backfill sin hacer; el CSV del dashboard y los domicilios crean clientes consentidos sin preguntarles |
| **Multi-sede «por dentro»** | §23 F5b/F5c/F6a-c, D8, D12 | — (solo miró el aislamiento) | 0.ALFA, 0.ZETA, 0.DELTA, 0.THETA | Las columnas existen y nadie las escribe; **Tepuy se arma con dos sedes (Laureles y Envigado)** y pidió un celular por sede |
| **Crons y VPS** | §25, §24-A2 | ESCALA-1, ESCALA-7, PROC-7 | ítem 8 (hora de `reward-reminder`) | 4 de 6 sin `maxDuration`; ningún test de handler; n8n «apagado» sin verificar |
| **El alta** | §11, §1.15-1.16, §21 | ALTA-*, OPER-3, OPER-9 | 0.AIOS, ítems 5 y 10 | 14 acciones manuales; faltan ~20 marcas |
| **Cobro** | §11.3, Handoff D-2 | OPER-1, RASTREO-10 | — | 100 % manual; nada suspende por mora |
| **Seguridad del AIOS** | §11.10 | ALTA-3, AISLA-3 | — | Un solo usuario, sin MFA, sin bitácora |
| **Domicilios por Zernio** | §18.c | ESCALA-3, RASTREO-12 | 0.AUTOCHAT, ítem 7 | Contesta antes de la IA ✅ (ESCALA-3); el operador no recibe confirmación ni aviso de fallo |
| **Black y puntos** | §17, §8 | — | deuda 17.b | Tarjeta y panel definen Black distinto; `?? 150` intacto |

---

## 5. Hallazgos nuevos de esta pasada (no estaban en agosto ni en la auditoría)

> Severidad es **juicio mío**, para ordenar; cada uno trae su evidencia.

| # | Sev. | Qué | Evidencia | Quién |
|---|---|---|---|---|
| N1 | 🔴 | **Consentimiento:** el «Importar CSV» del dashboard crea clientes con `accepts_marketing: true`; los domicilios nacen consentidos por el default de `createCustomer`; el check-in no escribe en `consent_events` y el backfill de D-8 no existe | `customers/page.tsx:159`, `delivery.service.ts:316`, `customer.service.ts:62` | D+C · micro (CSV) / feature |
| N2 | 🔴 | **¿Los registros del Supabase del AIOS están abiertos?** Todo `authenticated` pasa `requireUser()` y la RLS es `USING (true)`: si el proyecto permite sign-ups, cualquiera con la anon key entra a `removeOwner` y `reset_password` | AIOS `auth.ts:71`, `00001_init.sql:128`. ❓ Es un ajuste de Auth del panel de Supabase | **D · 1 min** |
| N3 | 🟠 | Un envío **fallido** bloquea el reintento: `hasRecentCampaignMessage()` no filtra por `status` y los `failed` también graban `sent_at` → 30 días de silencio en reactivación y **360 en cumpleaños** | `campaign.service.ts:115`, `:221` | C · micro |
| N4 | 🟠 | La reactivación agresiva no tiene tope superior: se repite cada ~30 días sin fin (es la fatiga que §16.1 quería evitar; inferido del código, sin verificar en `message_logs`) | `cron/reactivation/route.ts:160-243` | D+C · micro |
| N5 | 🟠 | Rutas de plantillas sin guardia de rol de marca: un administrador de sede edita, somete o adopta plantillas de toda la marca | `templates/catalog/[key]/route.ts:27`, `submit/route.ts:32`, `adopt/route.ts:24` | C · micro |
| N6 | 🟠 | La rama de botones sí/no del webhook de Zernio sigue esperando a Zernio (timeout 10 s) antes del 200: el mismo riesgo de apagón compartido que ESCALA-3 | `webhook/zernio/route.ts:260-272` | C · micro |
| N7 | 🟠 | Búsquedas sin paginar: `findBirthdayCustomers`, `findInactiveCustomers` y `getCustomersAtMonthlyCap` (esta mete miles de uuid en `.in()` y ante un error devuelve un `Set` vacío: el tope mensual no se aplica y no hay log) | `campaign.service.ts:40, 70, 273` | C · micro |
| N8 | 🟠 | Errores tragados: `getActiveTenants()` y `getTenantByDomain()` devuelven `[]`/`null` sin pasar por `db-failure.ts`; las escrituras posteriores al envío no leen `error` (si fallan, el mensaje salió pero ningún tope lo cuenta y se reenvía) | `tenant.ts:224`, `queue-drain/route.ts:377` | C · micro |
| N9 | 🟠 | Una marca Zernio dada de alta por el AIOS no deja rastro de ningún REJECTED ni PAUSED de sus 13 plantillas (más grave que RASTREO-3) | `template.service.ts:962`, `zernio/route.ts:669` | C · feature |
| N10 | 🟡 | La activación del AIOS nunca pasa la sede de `pending` a `zernio`: el semáforo sigue diciendo «falta instalar WhatsApp» hasta que el operador lo cambie a mano | AIOS `provisioning.ts:1878`, `sites.ts:188` | C · micro |
| N11 | 🟡 | El paso 5 del AIOS corre una sola vez desde la UI, y las plantillas del alta no dejan `template_versions`: el webhook las ignora | AIOS `SiteProvisioningWizard.tsx:394` | C · micro |
| N12 | 🟡 | La congelación de la cola de Golden Bullet al primer amarillo no existe: el amarillo exige 2 lecturas y solo aprieta (D-7.c) | `line-health.service.ts:236`, `queue-drain/route.ts:232` | C · micro |
| N13 | 🟡 | `device/register` (PIN del supervisor) no tiene límite de intentos | `staff/device/register/route.ts:151` | C · micro |
| N14 | 🟡 | `line-health` sondea marca por marca en serie sin presupuesto de tiempo | `cron/line-health/route.ts:74` | C · feature |
| N15 | 🟡 | La Copy de Campañas miente: «cumplen años hoy» (ya es 2 días antes), «8:00 AM» (es 13:00 Bogotá), «toque al día 21 y 25» (el dedupe real es de 30 días) | `campaigns/page.tsx:75, 76, 363` | C · micro |
| N16 | 🟡 | `getTemplateCatalogState` llama a la WABA de Zernio en cada carga de Mensajes, sin caché (de `0b4ec8e`, ya desplegado) | `template.service.ts:166` | C · micro |
| N18 | 🟠 | **ESCALA-4 llegó a producción rota:** la analítica dio 500 en todas las marcas (`LIKE` sobre una columna `date`, 42883) y hubo que revertir con un rollback de Vercel (unas horas); el hotfix `4907512` lo corrigió. **Ojo operativo:** tras un rollback, Vercel deja de publicar solo los push a `main`: el hotfix hubo que promoverlo a mano. Los tests de ESCALA-3/4 usaban un doble de PostgREST (la propia auditoría §8 lo advirtió: «NO verificado contra producción»), que no ejecuta el SQL real. **La lección es de proceso:** CI (PROC-1) no alcanza si la analítica se prueba contra un doble; hace falta un test contra el Postgres embebido y, más adelante, staging (PROC-3) | `ESTADO.md` §2 (fila del hotfix); auditoría §8 | C · feature |
| N19 | 🟠 | **Reseña:** el sello `google_review_clicked_at` se escribe **antes** de otorgar el premio: si el grant falla (`db_error`), el cliente queda **sin premio y sin pop-up para siempre** | `review.service.ts:262-306` | C · micro |
| N20 | 🟡 | La tarjeta roja pinta los puntos y sellos **de antes del escaneo** y no los refresca (el sondeo ya trae los nuevos, pero no se copian) | `CheckInForm.tsx:317,384`, `check-in/status/route.ts:233` | C · micro |
| N21 | 🟡 | La tarjeta **Black negra y dorada vive solo en `/tarjeta`, a la que ninguna pantalla enlaza**; la roja nunca cambia con Black (§17.2) | `tarjeta/page.tsx`, `wallet-card.md:156` | C+D · micro |
| N22 | ⚪ | El banner «Disponible» omite `invite` en su tipo y `GrantMetricsCards` no la etiqueta | `AvailableRewardBanner.tsx:10`, `GrantMetricsCards.tsx:29` | C · micro |
| N23 | 🟡 | Campañas → Manuales no pagina las plantillas de Twilio (pasadas 100, las demás **desaparecen**), y el envío manual solo rellena `{{1}}` nombre, `{{2}}` puntos y `{{3}}` próximo premio | `api/dashboard/templates/route.ts:77`, `campaigns/manual/route.ts:289` | C · micro |
| N17 | ⚪ | El README del AIOS promete un «olvidé mi contraseña» que no existe | AIOS `README.md:277` | C (docs) |

---

## 6. La cola de `ESTADO.md` §3, clasificada

> **G** = gesto del dueño (aplicar, mirar, configurar, probar) · **D** = decisión · **C** = código que se puede construir ya.
> **29 de 31 ítems piden algo del dueño (26 solo suyo, 3 mixtos); 2 son código puro** (0.PLANTILLAS y 0.ETA). La auditoría
> contaba 18 de 31. Mucho de lo suyo es chico (mirar, confirmar, pegar), pero **no avanza sin él**.

| Ítem | Tipo | Qué hace falta | Cruza con |
|---|---|---|---|
| 0.SEGURIDAD | **G** | Pegar la 00069 + las consultas de la 00015 y la 00030. Aparte, código: SEG-2 (carrera de `resolve`) y SEG-3 (`PUT tenant-config`): prompt en `docs/prompts/2026-10-04-seg2-resolve-y-tenant-config.md` | AISLA-1/2, OPUS-4 |
| 0.ESCALA | G | Desplegado (con el hotfix `ff9fd90`). Falta mirar, con un pedido real (lo cubre 0.AUTOCHAT), que `webhook/zernio` conteste enseguida y salgan las líneas `[Delivery]`; y que alguna pantalla lea el `error` de la analítica (hoy un 500 se ve como «0 clientes») | ESCALA-3/4, N18 |
| 0.CUMPLE | G | **Código desplegado el 10-04.** Falta crear la plantilla «Cumpleaños — dos días antes» en cada marca (Zernio: Enviar a Meta · Twilio: Crear · Tepuy ya la trae del AIOS v1.14.0); cada marca pasa sola al aprobarse | N3 |
| 0.DOMI | G | Encender «Domicilios por WhatsApp» en Planeta Wings; reiniciar o subir de Nano a Micro el Supabase del AIOS (Gateway Timeout) | ESCALA-2 |
| 0.AUTOCHAT | G | La prueba real: José escribe un pedido en el auto-chat. Verificar que la `ZERNIO_API_KEY` de Vercel sigue viva | §18 |
| 0.SUSHI | G | Verificación del negocio en Meta, alta en el AIOS, `ZERNIO_API_KEY` y `ZERNIO_WEBHOOK_SECRET` en Vercel, plantilla del Golden Bullet, tandas ≤ 250/día. La SIM de Twilio muere ~10-12 | §0.3, §1.16 |
| 0.AIOS | G | Variables en el Vercel del AIOS; rehacer el alta real de Tepuy | §11 |
| 0.PLANTILLAS | **C** | El rediseño en ocho pasos (el dueño lo pidió urgente el 09-12) | §12, OPER-5/6 |
| 0.GB | G | Encender el flag, escribir los textos y crear la plantilla (24-48 h), correr `line-health?dry=1`, decidir de qué marca es la base de 25.000 | §20 D-7 |
| 0.ALFA | G | Antes de habilitar la sede 2 de cualquier marca: marcar «grupo» en el AIOS, subdominio por sede, sede a cada mesero, `authorized_numbers` por sede, cupo real | §23 |
| 0.BETA | G | Verificar la coordenada con decimales en «Mis sedes» | |
| 0.GAMMA | D | `mystery_box_global_caps` pasaría a ser por sede sin que nadie lo decidiera | §23-D12 |
| 0.DELTA | D | ¿El administrador de sede ve el cubo NULL mientras el histórico no esté atribuido? | §23 |
| 0.ZETA | D+C | `rewards` y `campaign_rewards` recibieron `location_id` y nadie lo lee | §23-F6 |
| 0.ETA | **C** | La importación de CSV cuenta como importados los que la base rechazó (no mira `res.ok`); con 2+ sedes responde 409 | N1 |
| 0.THETA | D | «Un celular por sede» no está construido (F9, choca con D6); Tepuy lo pidió | §23-F9 |
| 0.IOTA | G | WhatsApp con Zernio nunca se estrenó de verdad: 6 pasos (secreto, header de firma, Team, sandbox, cupo 250, plantillas de evento) | §1.13-1.14 |
| 0.quinquies | G | Confirmar la 00009 del AIOS (sin ella, guardar un cliente «grupo» o «franquicia» revienta) | §11.11 |
| 0.quater | D+C | «Olvidé mi contraseña» (primero comprobar que el SMTP de Supabase esté configurado) | N17 |
| 0. | G | `AIOS_ADMIN_PROVISION_SECRET` igual en los DOS Vercel | |
| 0.bis · 1.bis | G | Rehacer Tepuy como una marca con dos sedes (SQL a mano) · mirar `/dashboard/marca` en un celular | ALTA-6 |
| 2 · 3 · 4 | G | Smoke test con Sushi Service real · asignar sede a los meseros o marcarlos rotativos (si no, no salen en ningún escáner) · Zernio de punta a punta | §19, §1.13 |
| 5 | G+C | `owner_email` vacío en las 5 marcas | OPER-3 |
| 6 | D | Qué muestra un subdominio sin marca: hoy cae en Sushi Service | |
| 7 | D | De §18 queda solo 18.c (la 18.e **ya está hecha**: el ítem se puede cerrar) | §18 |
| 8 | D | `reward-reminder` corre a las 11:00 Bogotá; la auditoría estimó ~16:00 | §25 |
| 9 | G | Aplicar la 00030 (cierra el DEFAULT puente) y confirmar si «todas» ya la incluyó | |
| 10 | G | Onboarding de los 25 (el deadline ~09-10 venció) | §1.16 |

---

## 7. Decisiones que solo el dueño puede tomar

> Ordenadas por cuánto trabajo desbloquean. **Sin estas respuestas hay trabajo que ninguna sesión puede empezar.**

1. **Canal y destinatario del aviso diario** (WhatsApp, correo, Telegram…; el dueño, o también cada restaurante) — §24-P2, RASTREO-1. Desbloquea casi toda la ola «ver y avisar».
2. **Tracking de errores:** ¿Sentry (con su costo) o un log drain de Vercel a algo consultable? — RASTREO-4.
3. **Team de Zernio:** ¿compartido con el otro proyecto o dedicado? — §0.5, OPER-8.
4. **Plantillas:** ¿cuántas aprobaciones por marca (13 → 8)? ¿probar UTILITY en recibos? ¿`tier_unlocked`/`reward_reminder` como plantillas nuevas o fundidas en `points_earned_near`? — OPER-5, §12.
5. **Consentimiento:** correr la consulta de conteo de D-8.b; ¿el «Importar CSV» deja de contar como consentimiento?; ¿un domicilio cuenta? — D-8, D-9.c, D-9.d (hay exposición legal, Ley 1581).
6. **Fatiga y ciclo:** las cinco preguntas 16.a–e (etapas, días, qué cuenta en las «6», reinicio por tiempo, ¿«escanear» incluye pedir domicilio?, backfill) y D-10.b **ya tienen un valor por defecto propuesto** en el spec del ciclo (spec §9, 10 decisiones): basta un «sí» (Q1 y Q2 de §10.5).
7. **Black:** ¿visitas, puntos o ambos? ¿qué es el «beneficio permanente»? ¿se cae de Black? ¿hay un nivel superior? — 17.a–d y la deuda 17.b.
8. **Cumpleaños:** crear la plantilla nueva antes de desplegar (0.CUMPLE).
9. **Multi-sede:** ¿el administrador de sede ve el cubo NULL (0.DELTA)? ¿el cupo global de la mystery box pasa a ser por sede (0.GAMMA)? ¿un celular por sede (0.THETA, F9)? ¿dos premios de reseña por cliente (F10)? ¿qué teléfono de domicilios responde el auto-reply (D9)?
10. **Cobro:** política de corte por mora, pasarela (Wompi) y precio único (OPER-1, OPER-9).
11. **El AIOS:** ¿se suma un segundo operador pronto (ALTA-3, AISLA-3)? ¿alta en lote (ALTA-5)? ¿autorregistro (§11.8)?
12. **Catálogo de producto:** referidos (4.12, 4.13), push (9.2–9.5), qué pasa al superar el tier máximo (8.1), usabilidad de Campañas (15.a, 15.b), copy editable (5.6), rediseño del QR de mesa (3.2).
13. **Menores:** el texto de confirmación de §18.c · qué muestra un subdominio sin marca · la hora de `reward-reminder` · ¿«Sushi Service Barra» qué es? (§2.1) · pasar Frangal a «Sin WhatsApp» (§21.4).
14. **Las 13 preguntas de tu lista de septiembre** (§10.5, Q1–Q13): la Tarea 1 (qué absorbe Recompensas), las plantillas puntuales, qué son «las 10 visitas», qué pasa con la elección de premio si se elimina la pantalla posterior, el interruptor de la reseña, quién gana en un referido y qué son los «pop-ups de Google». Q1 y Q2 (aprobar el spec del ciclo) son las que más desbloquean.

---

## 8. Contradicciones entre documentos (a corregir; un doc que miente es peor que ninguno)

| Dónde | Dice | Verdad (código) |
|---|---|---|
| `ESTADO.md` §3 ítem 7 y `ESTADO-REQUERIMIENTOS.md` | §18.e abierta | **Hecha** (`connection.service.ts:32`, `ce5d249`) |
| `ESTADO-REQUERIMIENTOS.md` | §7 no empezado · §12 «hecho» con 3 estilos y 26 textos · §19 «sin empezar» · 18.d «sin desplegar» · §3 con un Studio persistente | §7 cambió; hoy 1 estilo × 13 textos; §19 desplegado; 18.d desplegada; el Studio ya no existe |
| `CLAUDE.md` vs `ESTADO.md:23` vs `04-deployment.md` §5 | n8n «ACTIVO» · «Apagado» · «los triggers siguen encendidos» | **Sin verificar** (§1, §25-Fase1-off) |
| `cron/reward-reminder/route.ts:23` | «el disparador vivo sigue siendo n8n» | Lo dispara `vercel.json` |
| `ESTADO.md:24` | AIOS `c7e6dd5` (v1.13.1) | `b1b2465` (v1.13.2) |
| `whatsapp-templates.md` | «39 textos» · `promoteVersion()` único escritor · la copia del AIOS «se regenera con un script» | 13 textos · hay 5 escritores del puntero · no hay tal script |
| `multi-sede.md` | Cabecera «00044 NO aplicada»; «F9» con dos significados; «D» con dos sentidos (decisiones y deudas) | Aplicada; los números chocan entre documentos |
| `campaigns/page.tsx:75, 76, 363` | «cumplen años hoy», «8:00 AM», «día 21 y 25» | 2 días antes · 13:00 Bogotá · dedupe de 30 días |
| `identidad-visual.md:3` | «00047 SIN aplicar» | Aplicada |
| `RUNBOOK-SUSHI:117` vs `ESTADO.md:115` | `ZERNIO_WEBHOOK_SECRET` hecho · pendiente | Sin verificar |
| `zernio-api-contract.md:6` · `delivery-webhook.md:213` | «NO conectado a `whatsapp.service.ts`» · 18.c exige plantilla | Está conectado · basta texto libre en 24 h |
| `01-project-overview.md`, `02-architecture.md` | Un clon por cliente | Multitenant desde agosto |
| `DELEGACION_GUIDE.md` (tareas 7, 8, 10), `seed-new-tenant.sql:191`, `PROCESO_VENTAS…:88-115` | Un dominio por cliente en Vercel, un Supabase y un Twilio por cliente | Wildcard único y alta por el AIOS |
| `lib/delivery-silence.ts:46` | «mensajes y correos viven en el AIOS» | El AIOS no tiene ninguno |
| `send-governance.md:442` | Bloque 5, «congelamiento», hecho | No verificable en el código (N12) |
| `ESTADO.md` · `CLAUDE.md` | 587 y 125 líneas | Límites del método: 150 y 100 |


---

## 9. Propuesta de prioridades

> **El orden es una propuesta mía; la cola la ordena el dueño** (método §3). Criterios, en este orden: (1) riesgo vivo hoy ·
> (2) lo que frena dar de alta marcas 6…25 · (3) ceguera operativa · (4) escala técnica · (5) producto nuevo.
> Tamaños: micro (< 1 h) · feature (una sesión) · ola (varias sesiones, con plan en `docs/plans/`).

| Ola | Qué entra | Por qué en este lugar | Tamaño | Necesita del dueño | Migración |
|---|---|---|---|---|---|
| **P0 · Destrabar** (hoy, ~1 h suya, cero código) | Pegar la **00069** + consultas (00015, 00030, funciones abiertas) · **revisar en Auth del Supabase del AIOS que los sign-ups estén apagados** (N2) · borrar el CSV de la raíz · mirar en la UI de n8n que está apagado (permite apagar el VPS) · `ZERNIO_API_KEY` y `ZERNIO_WEBHOOK_SECRET` vigentes · correr las consultas de duplicados de `campaign_messages` y de conteo D-8.b (insumos de P2 y P5) | Es lo único que está VIVO hoy y cuesta minutos | gestos | todo | — |
| **P1 · Cierres micro + red de seguridad** (1-3 sesiones Sonnet) | SEG-2 (carrera de `resolve`) · SEG-3 (`PUT tenant-config`) · lista cerrada de claves del `PUT settings` · AISLA-5 test · AISLA-8 · `.mcp.json` `read_only` · `.gitignore` AIOS · **N1** (el CSV deja de consentir; `res.ok` de 0.ETA) · **N3, N4 y N15** (un fallo no bloquea el reintento · tope a la agresiva · el copy de Campañas que miente: son la **fase 0 del spec del ciclo** y los toma esa sesión) · **S-5.3 y N19** (reseña: el paso 2 sin premio y el sello antes del premio) · N6 (sí/no después del 200) · N7/N8 (paginar y no tragar errores) · aviso en pantalla del 500 de analítica · §8.2 (`?? 150`) · §17.1b · **PROC-1 (CI) + un test de la analítica contra el Postgres embebido** (N18: CI con dobles no habría cazado el 500) | Cada uno es chico y protege lo que viene: **todas las olas siguientes son largas y un push a `main` despliega**; CI primero paga de inmediato | micro ×~14 + 1 feature | solo el texto de 18.c | ninguna |
| **P2 · Plantillas y recompensas** | **S-1** (un solo apartado de Recompensas: la pestaña «Premios» sale de Campañas; ver Q3-Q5) · **S-2** (plantillas automáticas frente a manuales; poder crear plantillas libres en Zernio) · `0.PLANTILLAS` completo: un solo catálogo (el AIOS llama al producto) · `tier_unlocked`/`reward_reminder` (OPER-5) · rechazos y pausas con salida y rastro (RASTREO-3, N9, N5) · una sola pantalla · 13 → 8 y UTILITY · test de paridad (OPER-6) · `no_template_configured` visible (ALTA-2) | Cada marca nueva paga esta fricción; en Zernio el cruce de nivel es silencio total; el dueño lo declaró urgente el 09-12; y **es la base del ciclo**: el spec elige el premio y la plantilla desde la pantalla «Ciclo» | **ola** | decisión 4 y Q3-Q7 | ninguna o 1 |
| **P3 · Ver y avisar** | Resumen diario al dueño sobre `aios_health()` · tabla de corridas de cron por marca · status callback de Twilio · tracking de errores · bitácora de auditoría · aviso de saldo bajo · log en firma inválida · contador de gasto por marca (OpenAI y Zernio) · `/salud` filtrado | Antes de pasar de 25 marcas; hoy **nada** avisa | **ola** | **decisiones 1, 2, 3** | 2-3 (corridas, bitácora, gasto) |
| **P4 · El alta sin cuello humano** | Tablero de altas con aviso a las 72 h (ALTA-4) · activación que pasa a `zernio` sola (N10) · `owner_email` obligatorio (OPER-3) · «olvidé mi contraseña» · roles y MFA en el AIOS (ALTA-3, AISLA-3) · reescribir `DELEGACION_GUIDE` y `PROCESO_VENTAS` · cobro con pasarela y corte por mora (OPER-1) | De 14 acciones manuales a las menos posibles; la meta es que otra persona dé altas | **ola** | decisiones 10, 11 | 1-2 (AIOS) |
| **P5 · El ciclo de recuperación (el principal del dueño), consentimiento y fatiga** | **El spec del ciclo** (`docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md`), fases 1-3: el motor con sus triggers y el cron sobre `/api/cron/reactivation` · la plantilla `invite_expiring` · otorgar el premio al enviar · la pantalla «Ciclo» (línea de tiempo + vista por fecha con proyección + crear en tres campos) · invitaciones que vencen y recompensas por recorrido · calibrador de ritmo (S-A1…A13) · **más** el backfill de `consent_events` y su escritura en cada alta (D-8, D-9) | **Tú lo declaraste «el principal, porque de esto depende que funcione»** (§10). Además la fatiga se paga en el cupo de Meta y el consentimiento es exposición legal (Ley 1581). **Se recomienda empezarla ya, en paralelo con P2** | feature + **ola** (el spec calcula 5-7 sesiones) | **Q1 y Q2** (aprobar los defaults) y la decisión 5 | 1 del spec (la que dé el script; hoy diría 00070) + 2 de consentimiento |
| **P6 · Escala técnica** (antes de ~100 marcas) | Crons con el patrón de `queue-drain` (ESCALA-1) · UNIQUE anti-duplicado (ESCALA-7) con índices (ESCALA-11) · opt-out en lote (ESCALA-6) · caché de host (ESCALA-8) · límite de tasa compartido (ESCALA-9) · `(select …)` en RLS (ESCALA-10) · `line-health` con presupuesto (N14) · tests de handlers de cron · **probar con 1000 marcas sintéticas en staging** | El primer cuello es `queue-drain` a ~100-150 marcas con cola; con 5 marcas no urge | **ola** | confirmar el tier de Supabase | 2-3 |
| **P7 · Proceso** | Staging (PROC-3) · registro real de migraciones (PROC-2) · tests del AIOS (PROC-5) · podar `ESTADO.md` 587 → 150 y `CLAUDE.md` 125 → 100 · borrar el worktree de Kilo · permitir `graphify.exe` | Se paga solo cuando hay varios operadores | feature + ola | PROC-6, PROC-10 | — |
| **P8 · Catálogo de producto** (el dueño ordena por valor comercial) | **Multi-sede por dentro:** F5b/F5c, F6a-c, D8, D12 (Tepuy se arma con dos sedes y las 12 sedes de otra marca ya se contemplan en 0.ALFA) · Black (§17) · tier máximo (§8.1) · **S-7 y S-A14…A17** (pop-ups de Google, fechas especiales, ruleta, Instagram) · push (§9) · logo/paleta en el alta y en WhatsApp (§6.2, §6.5) · Google Contactos (§25-Fase3) · franquicias (§22) · línea por sede (F9) | Son los 35 pedidos «no empezados»; la mayoría espera una respuesta del dueño (§7) | olas | decisiones 7, 9, 12, Q12, Q13 | varias |
| **P9 · La tarjeta, las reseñas y los referidos** (tu lista, tareas 3 a 6) | **S-3** (qué pasa tras las 10 visitas: color y estrellas) · **S-4** (eliminar la pantalla posterior: la elección de premio / Mystery Box y el pop-up de reseña pasan a la roja) · **S-5** completa (interruptor de recompensa, validación del mesero, aviso de «recompensa faltante» S-6.4) · **S-6** (referidos: el apartado, la comunicación «trae a tu referido», la recompensa y su validación; es el §4 de agosto) · N20, N21, N22 | Es toda la experiencia del cliente final sobre la tarjeta roja y se hace junta para no tocarla cuatro veces. **S-6 necesita el catálogo unificado de P2**, y S-4 libera a S-6 de poner su botón en una pantalla que va a desaparecer | feature ×3 + **ola** (referidos) | Q8-Q11 | 1-2 (referidos) |

**Orden recomendado:** P0 → P1 → **(P2 ∥ P5)** → P9 → P3 → P4 → P6 → P7 → P8. *(La lista de septiembre cambió el orden: el ciclo, que
era P5 «al fondo», pasa a ir **en paralelo con P2** porque tú lo declaraste el principal.)*

**Lo que empezaría ya, sin esperar decisiones:** P0 y P1 (salvo N3, N4 y N15, que son la fase 0 de P5 y lleva esa sesión). **P2** también
(el dueño ya la ordenó urgente). **P5 puede arrancar apenas apruebes Q1 y Q2** (un «sí»): su fase 0 ya está escrita como prompt
(`docs/prompts/2026-10-04-ciclo-fase-0-y-1.md`). P3, P8 y P9 esperan respuestas de §7 y §10.5.

**Cómo repartir P2 y P5 en paralelo** (lo decide el planificador, por archivos). P2 vive en `template.service.ts`, el catálogo y los
catálogos del AIOS, y en las pantallas de Recompensas y Campañas (S-1). P5 vive en `cron/reactivation`, `campaign.service.ts`, el motor
y la pantalla «Ciclo». **Se cruzan en tres sitios que hay que repartir de antemano:** (1) `template-catalog.ts` y `template-texts.ts`
(P5 agrega `invite_expiring`; P2 reordena el catálogo) · (2) la pestaña «Premios» de Campañas (S-1 la quita; el spec §6.6 la deja) ·
(3) `campaigns/page.tsx` (P5 lo convierte en la pantalla «Ciclo»; P2 le quita una pestaña). P3 vive en `cron/*`, `aios_health()` y el
status callback; se cruza con P2 solo en `template.service.ts` (RASTREO-3, que queda en P2).

---

## 10. Tu lista de septiembre (pegada el 04-10), organizada

> **Fuente:** el texto original, completo y sin editar, está en el **Anexo A**. Cada pedido tiene un ID `S-…` y ninguno quedó
> afuera: 8 notas de contexto (`S-C`), 18 pedidos del flujo de campañas y el ciclo (`S-A`) y las 7 tareas con sus sub-pedidos
> (`S-1` … `S-7`). **El orden de tu lista es tu orden de prioridad** (lo dice la Tarea 7: «en lista de prioridades no es ya»),
> y tú declaraste que **el flujo de campañas es «el principal, porque de esto depende que funcione»**.

### 10.0 Lo que muestra el cruce

1. **El núcleo ya tiene diseño.** La sesión «Rediseño del ciclo de recuperación» (`ESTADO.md` §2, Fable, en vuelo) escribe el spec
   [`2026-10-04-ciclo-de-recuperacion-design.md`](superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md), un prototipo HTML y el
   prompt de construcción [`2026-10-04-ciclo-fase-0-y-1.md`](prompts/2026-10-04-ciclo-fase-0-y-1.md). **Es la «otra IA» que mencionas en
   la Tarea 2.** Contra tus 18 pedidos del flujo, el spec **cubre 12 por completo y 5 solo en parte** (los de largo plazo); el que
   falta es meta (S-A18). Este documento **no repite ni contradice** ese diseño: lo mapea (§10.2). Sigue siendo **solo diseño: no hay
   una línea de código**, y trae **10 decisiones tuyas con un valor por defecto** (spec §9): con un «sí» se construye así.
2. **Un choque con tu Tarea 1.** El spec deja una pestaña **«Premios» dentro de Campañas** (spec §6.6: «Ciclo · Mensaje libre · Premios ·
   Historial»). Tú pediste lo contrario: **todo lo de premios en Recompensas** (S-1). El spec tiene que ajustarse a tu pedido, no al revés.
3. **Lo que el spec no toca:** las Tareas 1, 2, 3, 4, 5, 6 y 7 (sus códigos `S-1`…`S-7`), y dos comunicaciones que nombraste para el
   largo plazo: **«cumpleaños del restaurante»** y **«datos curiosos / importantes»** (S-A17).
4. **Lo que el spec deja intacto y es justo lo que te frena:** el camino «Mensaje libre» (el asistente manual de hoy, con
   plantilla, variables y horario). Tu Tarea 2 apunta ahí: separar las plantillas automáticas de las que creas para campañas puntuales.
5. **Tres cosas que dijiste que NO se hagan:** eliminar el calendario (S-C2) · rediseñar cómo se ven las plantillas, «me encanta cómo se
   ven ahora» (S-2.4) · hacer ya los pop-ups de Google (S-7: «no es ya»).
6. **Tus reglas actuales (3 comunicaciones al mes, 7 días entre cada una) ya coinciden con el código** (`FREQUENCY_CAP_DAYS = 7`,
   `MONTHLY_MARKETING_CAP = 3`) y el spec las conserva; tú dijiste «tú verás si es así o de otra forma»: es una decisión que falta (§10.5).

### 10.1 Diagnóstico y contexto de negocio (no son tareas: el diseño tiene que respetarlos)

| ID | Qué dijiste | Dónde está recogido |
|---|---|---|
| S-C1 | El módulo de campañas/calendario combinado con plantillas es tan complejo que prefieres crear la plantilla a mano en Twilio y enviarla por el sistema al grupo | Spec §1 (problema 4) y §6.4 |
| S-C2 | El calendario no lo ha usado nadie, ni tu padre ni tú. **No hay que eliminarlo: hay que cambiar la forma de hacer las campañas** | Spec §6.3 (el calendario pasa a ser la «vista por fecha»; `/dashboard/calendar` redirige) |
| S-C3 | La reactivación pasiva y la agresiva «a nivel lógico no funcionan» y nadie las usa: hay que crear plantilla, entrar en configuración, asignar, ir a recompensa, crear la recompensa, volver a configuración y asignar la recompensa especial | Spec §1 (el cron no hace lo que crees) y fase 0; los pasos de la UI: §10.3 |
| S-C4 | El objetivo es que los clientes **vuelvan de verdad** («me importa un carajo si se ve bonito»). La métrica es el retorno | Spec §11 (retorno por toque a 14 días) |
| S-C5 | El modelo: puntos al azar + sellos por visita; los puntos **no se reinician** al reclamar (recorrido acumulado: 150 → premio, 300 → otro); los premios están **bloqueados por visitas** (150 puntos = 3 visitas). El acumular-por-consumo se perdió por el costo de integrar el POS | Spec §3.9 (puntos y sellos no vencen) |
| S-C6 | Hoy hay 3 automáticas: cumpleaños (1 al año), reactivación pasiva y agresiva (algunos restaurantes con premio, otros sin); a los ~28 días se acaban y todo se detiene hasta que el dueño manda algo manual a los «perdidos» (las bolitas de colores) | Spec §1 (en realidad la agresiva se repite cada ~30 días: N4) |
| S-C7 | **Dato curioso de un restaurante:** los clientes creyeron que redimir **gasta** puntos y muchos prefirieron acumular hasta el último nivel, cuando los puntos se mantienen | Spec §1 (problema 6) y §4: la tarjeta y la plantilla nueva dicen «tus puntos siguen intactos» |
| S-C8 | El dueño de restaurante es «flojo y disperso»: **3 minutos para crear una campaña es demasiado**. Y los **90 días «me los acabé de inventar»**: no hay estudio detrás | Spec §2 («90 no es sagrado»; se mide el retorno y se ajusta) y §6.4 |

### 10.2 El principal: el flujo de campañas y el ciclo de 90 días

> **Cobertura en el spec:** ✅ cubierto · 🟡 en parte · ❌ no está. **Hoy:** en código **nada** de esto existe (el spec es diseño). La
> fase 0 del spec (N3, N4, N15: parar la sangría) ya es la ola **P1**; el motor, la pantalla y el ritmo caen en la ola **P5**.

| ID | Pedido (fiel a tu texto) | Cruce con agosto y la auditoría | Spec del ciclo |
|---|---|---|---|
| S-A1 | Cambiar el flujo: «dos comunicaciones en un mes y ya se acabó hasta que el dueño ponga una campaña manual»; con la manual «se resetea» y repite las dos; «perdemos un flujo que puede ser de hasta 90 días» | §16.2a-c, N4 | ✅ §3.1-3.4 (activo → dormido → archivado; cinco toques en 90 días; toda visita abre el ciclo n+1) |
| S-A2 | Las reglas «no más de 3 comunicaciones al mes y 7 días entre cada una»: «tú verás si es así o de otra forma» | §16, `send-governance.md` | ✅ §3.3 las **conserva** y agrega una cuarta (a la sexta sin volver, dormido). Falta tu visto bueno |
| S-A3 | Un flujo de campañas más completo, sencillo de usar y que funcione **igual para todos** | §15.1 | ✅ §0 («con los defaults funciona igual para todas las marcas») |
| S-A4 | Que crear una campaña no cueste 3 minutos al dueño «flojo y disperso» | §15.1, N15 | ✅ §6.4 (crear en tres campos; «cero elección de plantilla») |
| S-A5 | Una **línea de tiempo de 90 días** con los estados, las campañas automáticas marcadas y los clientes en cada estado | §16.2c | ✅ §6.2 |
| S-A6 | Ver **en qué parte** va cada cliente y **en qué número de ciclo**: Juanita (entró, día 42, no volvió) frente a Sara (3.ª asistencia, 3.er reseteo) | §16.2d | ✅ §3.6 y §6.2 (la lista dice «ciclo n · visitas») |
| S-A7 | Optimizar mensajes: tras x mensajes y x días sin venir, **dejar de enviar o espaciar** a uno por mes, o uno cada 3 o 6 meses | §16.1, D-10 | ✅ §3.3-3.5 (6 mensajes → dormido; latido a los 90 y 180 días, máx. 2) |
| S-A8 | Que Sara reciba un mensaje distinto en cada ciclo, pero sin crear «muchísimas plantillas nuevas»: «la motivamos con su ciclo de premios» | OPER-5/6 (aprobaciones por marca) | ✅ §3.6 y §4 (cambian las variables y qué toques se saltan; **una** plantilla nueva, `invite_expiring`) |
| S-A9 | **Calendario y ciclo juntos:** ver qué clientes entrarán al programar una fecha; el ciclo cambia por cliente pero se ve dónde se agrupan, quiénes son frecuentes y cuáles nuevos; debajo, los días del mes que avanzan; alternar entre vista de ciclo y de calendario para crear campañas | §7, §23-D8 | ✅ §6.2-6.3 (vista por fecha con la **proyección**; «Crear aquí») |
| S-A10 | Un ciclo más largo («largo placista») si un restaurante lo necesita | — | 🟡 §2, §3.5 y fase 3: el largo sale de los días de los toques, y un calibrador por marca los ajusta; no hay un «ciclo largo» como tal |
| S-A11 | **Invitaciones con fecha de caducidad** para cada parte del ciclo, súper fáciles de crear; que suban de categoría **pero no mucho** (efecto Temu: «esperan a que les llegue algo mejor») | §4.8, 00063 | ✅ §5 y §3.6 (la escalera sube dentro del ciclo, nunca entre ciclos; cooldown de 180 días de la oferta fuerte) |
| S-A12 | Una que otra **recompensa redimible según el recorrido del ciclo**, personalizada, «como la agresiva pero más completa» | §17.3 | ✅ §5 (el premio depende de la etapa y del ciclo; **no** hay puntos extra por volver) |
| S-A13 | **Calendario y campañas en el mismo lugar**; más fácil, sencillo, eficaz, eficiente, **visual y «dopamínico»**, con colores fáciles de entender | §15.1, §7 | ✅ §6 y el prototipo HTML |
| S-A14 | *(largo plazo)* Datos curiosos y fechas especiales; un lugar para cargarlas o que **ayude a buscarlas según el tipo de restaurante y el país** (San Valentín, Halloween…) y que **diseñe la estrategia de 90 días** híbrida | §7 | 🟡 §10: un catálogo estático de fechas por país y rubro, pines «Crear evento desde aquí», sin IA en la v1. **«Datos curiosos» no está** |
| S-A15 | *(largo plazo)* **Activaciones especiales** dentro del pipeline: rifas, sorteos, premiaciones, clasificaciones de clientes del mes | — | 🟡 §10: la ruleta es una invitación con premio aleatorio; el cliente del mes sale de `POWER_RANKS` + un evento. **Rifas y sorteos como tales no** |
| S-A16 | *(largo plazo)* **Conectar con Instagram:** una ruleta de premios que la gente juega, gana y viene a redimir; «gestionamos por software, comunicamos por IG»; el post se crea solo; activaciones mensuales por IG | — | 🟡 §10: «es un proyecto propio» (Graph API de Instagram, una app de Meta con revisión, un token por marca en `tenant_integration_secrets`); el ciclo no lo necesita ni lo bloquea |
| S-A17 | *(largo plazo)* **Comunicaciones especiales** dentro del pipeline: fechas especiales, **cumpleaños del restaurante**, datos importantes, recuerdo de recompensas, cumpleaños del cliente, recuerdos, invitaciones especiales, activaciones mensuales | §7; el cumpleaños del cliente y el recordatorio de premio ya existen | 🟡 §3.7 (cumpleaños y eventos como interrupciones) y D5 (recordatorio). **«Cumpleaños del restaurante» y «datos curiosos/importantes» no están en el spec** |
| S-A18 | «Este es el principal porque de esto depende que funcione» | — | → es prioridad: §9 promueve la ola P5 |

### 10.3 Tareas 1 y 2: recompensas y plantillas (verificado contra el código de hoy)

**Tarea 1 — Un solo apartado de Recompensas**

| ID | Pedido (fiel a tu texto) | Lo que hay hoy | Estado · tamaño |
|---|---|---|---|
| S-1.1 | Hoy hay «un apartado de recompensas y uno de premios dentro de Campañas»: unificarlos | Son **cuatro** lugares, no dos: **Recompensas** (3 pestañas: Niveles y premios · Invitaciones · Redenciones, `rewards/page.tsx:28`) · **Campañas → pestaña «Premios»** (el catálogo `campaign_rewards`, `CampaignRewardsCatalog.tsx`) · **Ajustes** (premio de la agresiva, premio de la reseña, puntos, Black: ~160 líneas en `settings/page.tsx:987-1146`) · el **texto libre** del premio dentro de Invitaciones (`qr_campaigns.reward_title`, sin FK al catálogo) | ⬜ · feature (mover la pestaña) → ola (si también se mudan los bloques de Ajustes y se unifican los tres modelos de premio: pide migración) |
| S-1.2 | Que ese apartado maneje **todo**: premios, regalos, recompensas, **fijos y temporales**, recompensas de **cajas misteriosas**, etc. | Existen: niveles con su premio seguro, caja misteriosa (**dentro del diálogo del nivel, sin pantalla propia**), invitaciones, catálogo de campaña. **No existe «temporal» como tipo:** solo hay premios que no vencen (niveles) y premios cuya ventana se fija en cada otorgamiento (agresiva 7 días, reseña 30, invitación `window_days`). Los topes globales de la caja (`mystery_box_global_caps`) **no tienen pantalla**; `rewards` (hitos por visita) está en desuso y aún alimenta el `{{3}}` de las campañas manuales | ⬜ · ola |
| S-1.3 | Sacar «Premios» de Campañas | Es barato en código: `CampaignRewardsCatalog` solo lo importa `campaigns/page.tsx:28`; la ruta vieja ya redirige; **ningún test importa páginas ni componentes** (mover UI no rompe ninguno); hay 173 menciones en 45 docs por corregir. ❌ **Choca con el spec del ciclo §6.6**, que deja la pestaña «Premios» en Campañas | ⬜ · micro/feature |
| S-C3b | *(los pasos que describiste)* «crear plantilla, configuración, asignar, recompensa, crear la recompensa, configuración, asignar la recompensa especial» | **Tienes razón y se midió:** son **4 pantallas** (Plantillas → Ajustes → Campañas/Premios → Ajustes) si la plantilla se hizo a mano, **3** si salió del catálogo, con 24-72 h de Meta en medio. Y la tarjeta «Activa» de la reactivación en Campañas **no mira la agresiva** (`campaigns/page.tsx:90`): tras asignarla, la pantalla no lo refleja. «Crear la recompensa» **no se hace en Recompensas** sino en Campañas → Premios: justo donde no la esperas | → lo resuelve el spec (el premio se elige en la pantalla «Ciclo»); S-1 decide dónde vive el catálogo |

**Tarea 2 — Plantillas: automáticas frente a manuales**

| ID | Pedido (fiel a tu texto) | Lo que hay hoy | Estado · tamaño |
|---|---|---|---|
| S-2.1 | Distinguir las plantillas «que hayamos creado para una campaña manual extra» de las «que tengamos para campañas automáticas» | **Zernio:** el catálogo de 13 tarjetas está separado, y abajo «Todas tus plantillas en WhatsApp» (solo lectura) marca «En uso: <mensaje>» y «Golden Bullet» (`club_invite_*`); las que no llevan insignia **son** las puntuales, aunque no se llamen así. **Twilio:** lista plana que **no marca nada** (ni automática, ni puntual, ni evento) | 🟡 · feature |
| S-2.2 | Las automáticas: «una no se toca, se usa la misma, se modifica si hace falta algo puntual» | Zernio: se editan creando una versión nueva que Meta aprueba. Twilio: **no hay edición** fuera del catálogo. Para las que no son del catálogo no se puede editar en ningún proveedor | 🟡 · feature |
| S-2.3 | Las manuales: «se está creando constantemente para comunicaciones» | **Twilio:** sí (formulario «Crear Nueva Plantilla», solo texto, con ejemplos). **Zernio: no hay cómo crear una libre desde el panel** (solo el catálogo o Golden Bullet). `ManualCampaigns` **no tiene asistente de creación**: lista las aprobadas y manda a Plantillas | ⬜ (Zernio) · feature |
| S-2.4 | «Me encanta cómo se ven ahora» | Restricción: **no rediseñar lo visual** | — |
| S-2.5 | «Hay otra IA diseñando un plan… que lo tengas en cuenta» | Spec §4: **una sola plantilla nueva** (`invite_expiring`) para que no tengas que entrar a Twilio a crear invitaciones; el camino «Mensaje libre» (el que más te frena) **queda tal cual** | nota |

**Lo que haces hoy en Twilio ya funciona:** una plantilla creada en la consola de Twilio y aprobada **aparece sola** en Campañas → Manuales (`GET /templates` trae `ContentAndApprovals?PageSize=100`), sin pegar el `HX…`. Dos riesgos: **sin paginación**, pasadas las 100 plantillas las demás no salen; y el envío solo rellena `{{1}}` nombre, `{{2}}` puntos y `{{3}}` el título de la próxima recompensa (el front nunca manda `rewardId`). **Aparte:** `PUT /api/dashboard/settings` acepta cualquier clave, incluido un `*_template_sid`, así que un tenant Zernio puede pisar un puntero sin pasar por `promoteVersion()` (OPER-4, lista cerrada pendiente en P1).

### 10.4 Tareas 3 a 7: la tarjeta, la pantalla posterior, las reseñas, los referidos y los pop-ups

> **Ojo con la palabra «ciclo»:** en tu texto significa **dos cosas distintas**. El **ciclo de recuperación** (los 90 días sin volver;
> «el tercer reseteo de Sara») y el **ciclo de la tarjeta** (los 10 sellos; «Tarjeta #2»). El spec del ciclo trata solo el primero.

**Tarea 3 — La tarjeta después de las 10 visitas**

| ID | Pedido (fiel a tu texto) | Lo que hay hoy | Estado · tamaño |
|---|---|---|---|
| S-3.1 | «Luego de que llenan las 10 visitas, ¿qué sucede con la tarjeta?» | Los 10 sellos están **fijos** (`StampsGrid.tsx:9`, sin configuración por marca). Al llegar a 10 solo cambia la etiqueta: «Tarjeta #2 · 1/10». El **servidor no conoce ciclos de tarjeta**: solo suma `total_visits` | ⬜ · feature |
| S-3.2 | «Lo ideal es que **cambie de color**» | El único cambio de color que existe es la tarjeta **negra y dorada de Black**, que depende de **puntos** (`isBlackMember()`, `black-tier.ts:48`) y **solo vive en `/tarjeta`**, a la que **ninguna pantalla enlaza**. La tarjeta roja del check-in usa siempre el tema de la marca | ⬜ · feature |
| S-3.3 | «…y se vea en algún lugar, ejemplo **dos estrellas** que simbolicen el nuevo nivel de tarjeta» | «Nivel de tarjeta» y las estrellas **no existen como concepto** (`star` es solo uno de los 20 íconos de sello que elige la marca) | ⬜ · feature |

*Cuatro lecturas posibles de lo que pides, para que elijas:* (1) fin del ciclo de 10 sellos → la tarjeta pasa a «#2» con distintivo (solo presentación; el dato sale de `total_visits`); (2) subir de rango por visitas (Plata/Oro/Platino/Black ya existen en `POWER_RANKS`) y llevarlo a la tarjeta: toca la deuda 17.b; (3) llegar al Black por puntos y que **la tarjeta roja** también se ponga negra; (4) un «nivel de tarjeta» nuevo, ligado a «qué pasa al superar el tier máximo» (§8).
Cruce: §17 (Black), 17.b, §8.1. Los sellos de la roja además se ven **atrasados** (N20).

**Tarea 4 — Eliminar la pantalla que aparece tras el escaneo del mesero**

| ID | Pedido (fiel a tu texto) | Lo que hay hoy | Estado · tamaño |
|---|---|---|---|
| S-4.1 | «¿Qué tan necesario es el apartado donde las personas van luego de que el mesero les escanea el QR?» | **Identificado:** es `CheckInSuccess` (el cliente espera con un sondeo cada 5 s y, al registrarse la visita, la roja le cede el paso). Muestra «Visita #N», los puntos, la escalera completa de premios (`TiersRoadmap`), **la elección de premio seguro o Mystery Box** y el pop-up de reseña. La roja (`CustomerCard`) **ya tiene**: puntos, sellos, la barra «faltan N pts», el banner «Disponible» con los premios activos y el QR | respuesta |
| S-4.2 | «Creo que deberíamos eliminarlo definitivamente» | **Se puede, pero no es solo borrar:** lo único con función propia es **elegir premio seguro o Mystery Box**, y es el único sitio donde se reclama un nivel desbloqueado (mientras no se reclame, `check-in/status` lo sigue ofreciendo). Se tocarían `check-in/page.tsx`, `CheckInSuccess` y 5 componentes que solo ella usa (`GoogleReviewModal`, `PointsDisplay`, `RewardChoice`, `MysteryBoxResult`, `TiersRoadmap`), 3 rutas que quedarían sin llamador si no se reubican (`review-prompt`, `review-action`, `mystery-box/resolve`) y 4 docs. **Ningún test importa esas pantallas** (dos tests de servidor citan `status` y `resolve`). `/c/[slug]` ya termina en la roja | ⬜ · feature |
| S-4.3 | «Todo puede vivir en la primera tarjeta rojita: la info, los premios disponibles… y así nadie se pierde» | **En parte ya vive:** premios otorgados y puntos sí. **No viven en la roja:** la elección de premio/Mystery Box, el pop-up de reseña, la escalera completa (se quitó a propósito), la confirmación «Visita #N» y los **totales frescos** (la roja pinta los de antes del escaneo) | 🟡 · feature |
| S-4.4 | «…y el mismo pop-up de reseñas en la tarjeta roja» | Hoy solo lo monta `CheckInSuccess`, 2,5 s después del éxito, y lo **retiene mientras haya una Mystery Box sin elegir** | ⬜ · feature |

Cruce: choca con el CTA «Gánate X por traer a un amigo» que el plan de referidos ponía en `CheckInSuccess` y `CustomerCard` (`referral-program.md:23,161`): pasa solo a la roja (S-6).

**Tarea 5 — La recompensa por reseña de Google**

| ID | Pedido (fiel a tu texto) | Lo que hay hoy | Estado · tamaño |
|---|---|---|---|
| S-5.1 | «¿De qué manera recompensamos a la persona si deja reseña de Google?» | Premio del catálogo (`admin_settings.review_reward_id`, ventana de 30 días por defecto), otorgado con `source='review'`; **un solo premio por cliente de por vida** (índice único + el sello `google_review_clicked_at`). **Se otorga al tocar el enlace, no al reseñar:** Google no avisa. El mesero lo ve con la insignia RESEÑA, pero **solo si el cliente visitó en las últimas 6 h** | 🟡 |
| S-5.2 | «¿El apartado de si el restaurante elige dar recompensa o no está bien hecho?» | **No hay interruptor.** «Sin recompensa» es dejar **vacío un desplegable** en Ajustes (`settings/page.tsx:1106`). Un premio desactivado en el catálogo se degrada **en silencio**. No hay ningún aviso | ⬜ · micro |
| S-5.3 | «Está hardcodeado el mensaje del pop-up que asume que el restaurante siempre da recompensa» | **Cierto a medias.** El título y el subtítulo **sí se adaptan** (con premio / sin premio, `GoogleReviewModal.tsx:168`). **Siguen fijos:** el paso 2 dice «Redime tu regalo» **aunque no haya premio** (`:239`) y el texto de ayuda de Ajustes dice «gánate X por dejarnos una reseña» (`settings:1086`) | ⬜ · micro |

Cruce: §12 (plantillas), la deuda de reseñas por sede (§23-F10) y **N19** (si el premio falla después de sellar la reseña, el cliente se queda sin premio y sin pop-up para siempre).

**Tarea 6 — Referidos y su recompensa**

| ID | Pedido (fiel a tu texto) | Lo que hay hoy | Estado · tamaño |
|---|---|---|---|
| S-6.1 | «Ya tenemos el apartado de invitaciones: necesito que creemos ya el apartado de **referidos**» | **No existe** (ni tablas, ni `/r/{código}`, ni pantalla; `referral-program.md` es un plan). Sí existe el tramo «premio → el mesero valida» (`reward_grants`, `/mesero/rewards`, `/api/reward-redeem`) y las invitaciones (00063), que **premian solo a quien se registra: no hay «referidor»**. `GrantSource 'manual'` está reservado para esto y nadie lo escribe | ⬜ · **ola** (= §4 de agosto) |
| S-6.2 | «…y agreguemos esa comunicación de **trae a tu referido al flujo mensual** de los clientes» | No hay plantilla ni cron con «trae a un amigo» (el catálogo de 14 no tiene referidos; el diseño planeaba `referral_welcome` y `referral_completed`). El flujo mensual tiene un tope de **3 mensajes por cliente al mes**: ¿mensaje propio (consume cupo) o un toque del ciclo (spec §3.2)? | ⬜ · feature + espera de Meta |
| S-6.3 | La recompensa «se crea en el apartado de recompensas (para campañas agresivas, nuevo flujo de campañas, referidos), que ya no sé cuál es» | Tienes razón: son **tres sitios sin unificar** (el catálogo, en Campañas → Premios · el premio de la agresiva y el de la reseña, en Ajustes · las invitaciones, en Recompensas). **«Recompensas» no contiene el catálogo ni los selectores** | → **S-1** |
| S-6.4 | «Que salga un aviso: *para las reseñas no tienes ninguna recompensa activa; si los clientes reciben pop-up sin recibir ninguna recompensa va a disminuir tu ratio*» | **No existe.** Lo más cercano es `ReviewFunnelCard`, que avisa del enlace de Google solo si nadie vio el pop-up. Mismo patrón para la agresiva, los referidos y el resto: un **aviso de «recompensa faltante»** | ⬜ · micro/feature |
| S-6.5 | «Estas recompensas se tienen que **rastrear** y salir **disponibles en el celular del mesero y del cliente**» | **Ya pasa** con todo lo que sea `reward_grants`: el mesero ve los 6 orígenes (reseña, invitación, agresiva, caja, nivel, manual) y el cliente ve el banner «Disponible» en la roja. Un origen nuevo (`referral`) pide tocar el CHECK, el tipo y 3 mapas. Defectos chicos: el banner omite `invite` en su tipo y `GrantMetricsCards` no la etiqueta (N22) | ✅ para lo existente |
| S-6.6 | «Para redimirlas el mesero debe escanear o validar de alguna manera, **obtenga la recompensa ese día el cliente o no**» | La redención del mesero existe (elige quién redime y mesa). **Matiz:** la lista del mesero solo muestra clientes con visita **en las últimas 6 h**: un cliente que no vino hoy no aparece | 🟡 · micro |
| S-6.7 | «Para dar el regalo [de reseña] tiene que **validar que el cliente haya dejado la reseña**» | Hoy el mesero lo hace «mirando», pero **el sistema no lo exige**: el premio ya se otorgó al tocar el enlace y no hay estado «reseña verificada» | 🟡 · decisión (S-5) |

**Tarea 7 — «Pop-ups de Google» en las notificaciones del celular** *(tu nota: «en lista de prioridades no es ya, pero es importante»)*

| ID | Pedido (fiel a tu texto) | Lo que hay hoy | Estado · tamaño |
|---|---|---|---|
| S-7.1 | «Crear los pop-ups de Google, que sean **nuevos para la persona**» | **Ambiguo: tres lecturas.** (a) un pase de **Google Wallet** con notificaciones; (b) **notificaciones del navegador** (web push/PWA); (c) **mensajes de WhatsApp con botones**. De (a) y (b) hay **cero** infraestructura (sin Wallet, sin manifest, sin service worker, sin tabla de tokens). De (c) hay **una sola plantilla con botones** (Golden Bullet: «Quiero ser parte» / «No, gracias») | ⬜ · **ola** |
| S-7.2 | «Explotar al máximo… las notificaciones del celular **agregando botones**» | El catálogo de 14 plantillas no lleva botones. Zernio solo modela botones de respuesta rápida (sin payload propio); el envío acepta botones de URL, copiar código y flujo, pero **nada los crea ni los usa**. Cada plantilla nueva es una aprobación de Meta por marca (24-48 h) | ⬜ |
| S-7.3 | «Tal vez **contadores de tiempo y colores** para que la gente pueda tocar» | El vencimiento ya existe **en la app** (`reward_grants.expires_at`, con una etiqueta de días estática, no un contador vivo); no existe como componente de plantilla. Colores y contadores solo viven dentro de la web (tarjeta y banner), no en ninguna notificación | ⬜ |
| S-7.4 | «Ejemplo: **redimir recompensa** y les salga una invitación para ir al restaurante» | Depende de la lectura: en WhatsApp sería un botón que abra el premio para que el mesero lo valide (reusa `reward_grants`); en Wallet o push, todo es nuevo. Choca con el check-in «sin estado» (web push exige atar un token a un cliente: §9.4 de agosto) | ⬜ |

Cruce: §9 de agosto (push, NO EMPEZADO, con sus 4 preguntas) y S-A16 (Instagram). La auditoría de competencia ya argumentaba que **en Colombia WhatsApp gana a push**.

### 10.5 Preguntas nuevas para ti (las tuyas, ordenadas)

> Además de estas, el spec del ciclo trae **10 decisiones con un valor por defecto** (spec §9): con un «sí» se construye así y de paso
> quedan cerradas las 16.a–e de agosto.

| # | Pregunta | Sobre | Lo que propone el diseño o el código |
|---|---|---|---|
| Q1 | *(Hoy: `PENDIENTES.md` A1–A7, 19 decisiones.)* ¿Apruebas los 10 valores por defecto del spec del ciclo? (toques a los días 12 · 24 · 38 · 56 · 80; qué cuenta para las «6»; el contador no se reinicia por tiempo; el domicilio reinicia; backfill hacia adelante; latido a dormidos; cooldown de 180 días de la oferta fuerte; eventos no van a dormidos; `invite_expiring` probada también como UTILITY; **sin** bono por volver) | S-A1…A13 | Sí, todos (spec §9) |
| Q2 | ¿Se mantienen «máx. 3 comunicaciones al mes y 7 días entre cada una»? Tú dijiste «tú verás si es así o de otra forma» | S-A2 | Se mantienen (spec §3.3) |
| Q3 | ¿Recompensas absorbe **también lo que hoy vive en Ajustes** (premio de la agresiva y de la reseña, puntos, pity timer, Black) o solo se mueve la pestaña «Premios»? Define el tamaño de la Tarea 1 | S-1.1 | — |
| Q4 | ¿«Temporal» es un concepto **nuevo** (un premio con fechas propias) o la ventana de reclamo que ya se fija en cada otorgamiento? ¿«Fijo» es el premio seguro del nivel o el del catálogo? | S-1.2 | Hoy solo existe la ventana por otorgamiento |
| Q5 | ¿Se unifican los **tres modelos de premio** (catálogo `campaign_rewards`, texto libre de las invitaciones, niveles/caja)? Pide migración. ¿Qué se hace con `rewards` (hitos por visita, en desuso)? | S-1, S-6.3 | — |
| Q6 | Plantillas «puntuales»: ¿son de **un solo uso** o una **biblioteca reutilizable** («se usa la misma»)? ¿La separación va en **pestañas dentro de Plantillas** o se mueven a Campañas → Manuales? | S-2.1 | Tu frase apunta a biblioteca |
| Q7 | ¿Las marcas **Zernio** necesitan crear plantillas libres desde el panel (hoy no pueden)? Las que haces en la consola de Twilio ¿basta con que aparezcan solas o hay que pegar el `HX…`? ¿Qué variables, además de nombre, puntos y próximo premio? | S-2.3 | Aparecen solas (con tope de 100) |
| Q8 | **«10 visitas»:** ¿es completar el ciclo de 10 sellos o llegar a Black (10+ del panel)? ¿Las estrellas cuentan **tarjetas completadas** o **niveles**? ¿Dónde se ven: la tarjeta roja, `/tarjeta` (hoy sin enlace) o ambas? ¿El 10 es igual para todas las marcas? | S-3 | — |
| Q9 | Si desaparece la pantalla posterior: la **elección de premio / Mystery Box** ¿pasa a la roja, se entrega el premio seguro solo, o se resuelve en el celular del mesero? ¿La roja se refresca sola con los puntos nuevos? ¿El pop-up de reseña sale justo tras el escaneo (hoy 2,5 s después) o al abrir la tarjeta? ¿La escalera completa vuelve a la roja o basta el próximo premio? | S-4 | — |
| Q10 | Reseñas: ¿un **interruptor explícito** «dar recompensa: sí/no» o basta el desplegable vacío? Sin premio, ¿se quita el paso 2? ¿El premio se da **al tocar el enlace** (hoy) o solo cuando el mesero **ve** la reseña? ¿Uno por cliente **de por vida** (hoy) o por periodo? ¿Por sede o por marca? | S-5, S-6.7 | — |
| Q11 | Referidos: ¿gana **solo el referidor o ambos**? ¿Premio del catálogo o puntos? ¿Se acredita al **registrarse** el amigo o al **validar el mesero** su primera visita? ¿Mensaje propio (consume cupo) o **toque del ciclo**? ¿Dónde se configura? | S-6 | Es 4.12 y 4.13 de agosto |
| Q12 | «Pop-ups de Google»: ¿**Wallet, push del navegador o WhatsApp con botones**? ¿A quién llega: a la base con WhatsApp (ya alcanzable) o también a quien nunca dio teléfono? ¿«Redimir recompensa» abre el premio para que el mesero lo valide? ¿«Contador de tiempo» es el vencimiento real o urgencia visual? | S-7 | WhatsApp con botones es lo más cercano |
| Q13 | Largo plazo: ¿se confirma que **fechas especiales, ruleta e Instagram** son la fase 4? ¿«Cumpleaños del restaurante» y «datos curiosos» entran como toques del ciclo o como eventos? | S-A14…A17 | Fase 4 (spec §10) |

### 10.6 Dónde cae cada cosa de tu lista en las olas (§9)

| Tu pedido | Ola | Por qué ahí |
|---|---|---|
| S-A1…A13 + las 10 decisiones del spec | **P5** (promovida: es «el principal») · la fase 0 del spec (N3, N4, N15) ya está en **P1** | Es lo que más peso tiene según tú; el spec ya está escrito y pide tu «sí» (Q1) |
| S-1 (un solo apartado de Recompensas) y S-2 (plantillas automáticas/manuales) | **P2** («Plantillas y recompensas») | Son la base sobre la que se para el ciclo: el spec elige el premio y la plantilla desde la pantalla «Ciclo». Lo que decida S-1 cambia la pestaña «Premios» del spec |
| S-5.3 (paso 2 y texto de Ajustes) y **N19** (reseña sellada antes del premio) | **P1** | Son micro arreglos de corrección, no de diseño |
| S-3, S-4, S-5 completa y S-6 | **P9** (nueva: «La tarjeta, las reseñas y los referidos») | Todo es experiencia del cliente final en la tarjeta; S-6 necesita el catálogo unificado de S-1 |
| S-7 y S-A14…A17 (largo plazo) | **P8** | Cada uno es un proyecto propio (Wallet/push, Instagram, fechas especiales) |

---

## 11. Lo que NO se pudo verificar (y quién lo resuelve)

- **Producción / base real:** que la 00069 siga sin aplicar · si la 00015 y la 00030 corrieron (consultas 2 y 3 del prompt de la ola 0) · `owner_email` de hoy · tamaño de `campaign_messages` y duplicados existentes · el tier del Supabase del producto · el valor real de `whatsapp_auto_reply_enabled` en Sushi Fun · qué marcas tienen un nivel `is_black` · si los sign-ups del Supabase del AIOS están apagados · la 00009 del AIOS · el límite de filas de PostgREST.
- **Consolas de terceros:** que el hotfix de la analítica funcione en las 5 marcas (lo dice `ESTADO.md`; no se vio la consola de Vercel) · `OPENAI_API_KEY` y `delivery_default_city` en Vercel · si los crons corren (logs) · si n8n está apagado · el plan de Vercel (Pro) · la suscripción al evento `whatsapp.template.status_updated` en Zernio · el nombre real del header de firma de Zernio · el proveedor real de cada marca · las plantillas aprobadas por marca en Meta · `ZERNIO_API_KEY` vigente en el Vercel del producto y del AIOS.
- **De este documento:** el costo de los 10 auditores no se midió; los conteos (224 pedidos, 68 hallazgos) dependen de cómo cada auditor partió los ítems; la severidad de §5 es juicio mío; `REQUERIMIENTOS_JULIO_2026.md` y `REQUERIMIENTOS_SISTEMA.md` no se revisaron.

---

## Anexo A — El texto original del dueño (2026-10-04), sin editar

> Pegado tal cual, con sus erratas y sus acentos. Es la fuente de verdad de §10: si una fila de §10 dice algo distinto, manda
> este texto. El bloque «(#Contexto Te voy a mostrar mi sistema…)» dentro de la Tarea 2 es el prompt que el dueño le dio a **otra IA**
> para que diseñe el plan del flujo de campañas; ese plan es `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md`.

````text
#Requerimientos septiembre Cada1 

##Contexto

Luego de varios meses de uso tanto mios cómo de los clientes llegué a la conclusión qué el modulo de campañas/calendario sigue siendo muy complejo de usar combinado con el de plantillas, llegando al punto de que personalmente prefiero entrar a twilio y crear la plantilla manualmente para luego enviarla por el sistema al grupo de clientes correspondiente de dicha campaña

Entonces, el calendario nadie lo ha usado ni mi propio padre que estuvo desde el principio viendo la creación del sistema ni los demás ni yo mismo, esto no quiere decir que haya que eliminarlo, quiere decir que hay que modificar la forma de hacer las campañas

También tengo problemas con la parte de reactivación pasiva y agresiva resulta que a nivel logico no funciona y segundo, nadie las está usando ni se toma en cuenta porque es complejo de usar, deben crear plantilla, entrar en configuración, asignar, luego ir a recompensa, crear la recompensa ir a configuración y asignar la recompensa especial para la campaña agresiva

##Tareas
###1 
Re organización, tenemos un apartado de recompensas y uno de premios dentro del apartado de Campañas esto quiero cambiarlo, quiero un apartado dentro de recompensas, ahí manejaremos todo lo que es premios, regalos, recompensas, fijos y temporales, recompensas de cajas misteriosas etc

###2

Plantillas, me encanta cómo se ven ahora pero necesito que me distintas plantillas por ejemplo que hayamos creado para una campaña manual extra y plantillas que tengamos para campañas automaticas, son diferentes una no se toca, se usa la misma, se modifica si hace falta algo puntual, la otra se está creando constantemente para comunicaciones etc, en esta parte hay otra IA diseñando un plan con este promt para que lo tengas en cuenta (#Contexto

Te voy a mostrar mi sistema porque tengo que optimizarlo ya que varios clientes me han dicho lo mismo, eres el modelo de frontera más inteligente desarrollado y necesito tu logica compleja de solución de retos para mejorar esto, el objetivo es, en esencia, hacer que vuelvan los clientes, me imporata un carajo si se ve bonito o si la idea suena bien, necesito que vuelvan realmente, punto final, entran los clientes que van a comer a un restaurante o piden domicilio, luego de esto, el sistema debe encargarse de hacerlos volver comunicando lo que sea por whatsapp, por cuanto tiempo debería de comunicarse este sistema con ellos hasta que vuelvan, osea, en que punto se detiene en caso de que no vuelvan y retome cuando se registre otra visita?, qué tipo de comunicaciónes debería hacer? tomando en cuenta de que fideliza, osea, los clientes reciben puntos al azar cada vez que vienen y se les marca un sellito y mientras vayan avanzando van recibiendo puntos, estos puntos no se resetean una vez reclaman una recompensa, si no qué se van acumulando como un recorrido, llegas a 150 ganas x, sigues, llegas a 300 ganas y, entonces el sistema tiene en la foto que te cargué, 3 oportunidades de comunicarse con el cliente  (en automatico) un mensaje al año de cumpleaños que envía automaticamente, un mensaje de reactivación pasivo y un mensaje de reactivación agresivo, algunos restaurantes tienen premio para la reactivación agresiva y otros no, ya, luego de 28 días más o menos se gastó las dos reactivaciones y el cumpleaños es cuando el cliente cumpla así que no cuenta, luego de esto no hay más comunciaciónes automaticas, se detiene, hasta que el dueño entre y envíe algo manual a los clientes que no hayan vuelto que se encuentran aquí (bolitas de colores), revisa el graph para entender mejor todo esto

Hay una complicación, al principio se quería hacer un sistema de acumulación de puntos y redención, ejemplo, acumulas un punto por cada 1000 pesos, luego redimes por x premio, perfecto ya que el negocio sabe cuanto has gastado y puede permitirse darte x producto por cada x cantidad acumulada, así mantenemos un gasto sano y retorno para ambas partes, PEROO hay un problema, ningun restaurante podía permitirse una implementación cruzada con sus POST ya que valía mucho, personalizado para cada caso, así se creó este software, democratizar fidelización sin depender de mucha personalización a precio accesible para todos, pero, perdimos el tema de acumular paralelo a consumo, ahora, los clientes acumulan puntos al azar (para aumentar un poco la emoción del sistema) acumulan tanto puntos cómo sellos por visita, ven las dos cosas, puntos y sellos, y aunque la ganancia de puntos sea aleatoria (percepción del consumidor de poder ganar más rapidamente premios dependiendo de su suerte) la ganancia de premios está bloqueada si o si por numero de visitas, ejemplo necesito 150 puntos para llegar pero si o si esos 150 puntos te los vas a ganar en 3 visitas

En uno de los lugares donde mejor ha funcionado, los clientes naturalmente pensaron que los puntos los acumulaban y gastaban si pedian una recompensa y muchos optaron por escoger acumular para llegar al ultimo nivel, cuando lo que sucede es que no importa si redimen o no su premio pueden en mantener sus puntos, disfrutar de sus recompensas e ir avanzando hasta llegar, pero esto me pareció muy curioso
##Tarea
Iba a asignarte tareas pero te lo dejo a tu criterio, necesito lo siguiente

Primero el flujo de campañas no me está sirviendo, dos comunicaciones en un mes y ya se acabó hasta que el dueño entre y ponga una campaña manual, si la persona vuelve por la campaña manual ahí si se resetea y le envía dos mensajes automaticos, las dos campañas y luego de apaga de nuevo, ineficiente, perdemos un flujo de comunicaciones que puede ser hasta de 90 días, las reglas son, no más de 3 comunicaciones al mes, 7 días entre cada comunicación para que no se canse (esto puede cambiar pero así lo definí al principio siguiendo las reglas y estudios de psicología de comunicación que encontré en internet)

Quiero ya tu veras si es así o de otra forma

Tener un flujo de campañas más completo que sea sencillo de usar y funcione igual para todos, porqué? 

El dueño de restaurante es flojo y disperso, es activo para apagar incendios todo el día, para eso tiene energía de sobra, para invertir 3 minutos en crear una campaña es literal cómo si le dijeras, dame una tesis de 72 paginas de las reacciones moleculares en el pollo, entonces, si encontraramos la forma, me gustaría que fuera una linea de tiempo de 90 días donde se vean los estados y estén marcadas las campañas automaticas y los clientes en cada estado, osea en que parte van y tambíen en qué número de la barra van, porque piensa esto, es diferente juanita que entro al recorrido de 90 días y va en el día 42 y no ha vuelto nunca, osea asistió una vez y no ha vuelto, a Sara que ya es su tercera asistencía y es su tercer reseteo en la barra de 90 días (los 90 días me los acabé de inventar lit no tengo idea de a nivel psiologico o comunicativo que tan largo deba ser esto, también para optimizar mensajes, si un cliente luego de recibir x mensajes y tener x días sin venir debemos dejar de enviarle comunicaciónes o reducir la brecha entre comunicaciones a una por mes o incluso una cada 3/6 meses) entonces sería ideal que Sara recibiera un mensaje diferente en cada ciclo pero es muy complicado, son muchas muchas plantillas nuevas que crear, así que la motivamos con su ciclo de premios etc 

Y tenemos el calendario entonces sería muy bonito poder combinar esto para ver qué clientes cuando programemos una fecha van a entrar, si usamos el ciclo de 90 días (y luego largo placista si es que es necesario para un restaurante) que va a ir cambiando para cada cliente porque entran en fechas diferentes pero nosotros podremos ver en que parte de ese ciclo se van reuniendo y qué clientes son frecuentes en ese ciclo, cuales son nuevos, y qué tengamos debajo de ese ciclo los días del mes que cada día que pase avancen los días debajo pero el ciclo siempre será el mismo y podamos cambiar entre esa vista y la vista de calendario para poder crear nuevas campañas

En este mismo tema disculpa que te diga tantas cosas pero para hacer un cambio hay que considerarlas todas

Agregar el tema de crear super facilmente invitaciones con fecha de caducidad para cada parte del ciclo, que motiven aún más a venir, que tal vez vayan subiendo de categoría pero no mucho porque si no todos van a querer esperar a que les llegue algo mejor, tipo Temu que si agregas un articulo al carrito y esperas varios meses te tiran descuentos potentes y lo sigues haciendo porque sabes qué funciona

Una que otra recompensa que puedan redimir en base a su recorrido del ciclo personalizado para cada quien, algo cómo lo que ya hacemos con la campaña agresiva pero mejorado, más completo. 

Necesito es qué calendario y campañas estén en el mismo lugar, mejorar la forma de hacer las campañas, qué sea más facil, más sencillo, más eficaz y eficiente, más visual y dopaminico para el dueño, con colores, faciles de comprender 

Dicho esto te cargo un contexto que recopilé 


Luego de varios meses de uso tanto mios cómo de los clientes llegué a la conclusión qué el modulo de campañas/calendario sigue siendo muy complejo de usar combinado con el de plantillas, llegando al punto de que personalmente prefiero entrar a twilio y crear la plantilla manualmente para luego enviarla por el sistema al grupo de clientes correspondiente de dicha campaña

Entonces, el calendario nadie lo ha usado ni mi propio padre que estuvo desde el principio viendo la creación del sistema ni los demás ni yo mismo, esto no quiere decir que haya que eliminarlo, quiere decir que hay que modificar la forma de hacer las campañas


Ayudame a solucionar esto que hay varios aspectos que tengo que modificar aparte de este porfa pero este es el principal porque de esto depende que funciona

Cómo contexto adicional toma en cuenta lo siguiente

A largo plazo me gustaría que la estrategia de comunicación incluyera datos curiosos, fechas especiales, un lugar donde podamos cargar o nos ayude incluso a buscar en base a nuestro tipo de restaurante, fechas especiales en nuestro país (san valentin, halloween, etc etc) y nos diseña la estrategia de 90 días de comunicaciones hibrida con estas fechas y que también en este pipeline podamos crear activaciones especiales algo que casi nadie hace, rifas, sorteos, premiaciones, clasificaciones especiales de clientes del mes, que lo conectemos a IG y por ejemplo podamos regalar una ruleta de premios que la gente haga, gane y venga a redimir, gestionamos por software comunicamos por IG si logramos eso la rompemos a todo nivel, porque el pipeline de 90 días lo super reventamos con comunicaciones especiales, de fechas especiales, cumpleaños del restaurante, datos imporatnes, recuerdo de recompensas, cumpleaños del cliente, recuerdos, invitaciones especiales, activaciones mensuales que se activan directamente también por IG, con un post que se cree automaticamente, etc, sería una belleza
)

### Tarea 3 

Luego de que llenan las 10 visitas qué sucede con la tarjeta? lo ideal es que cambie de color y se vea en algún lugar ejemplo dos estrellas que simbolicen el nuevo nivel de tarjeta porfavor 

###Tarea 4
Qué tan necesario es el apartado donde las personas van luego de que el mesero les escanea el Qr? Creo que deberíamos eliminarlo definitivamente porque facilmente todo puede vivir en la primera tarjeta rojita, la info, los premios disponibles y así nadie se pierde y el mismo pop up de reseñas en la tarjeta roja

###Tarea 5
De qué manera recompensamos a la persona si dejan reseña de google, el apartado de si el restaurante elije dar recompensa o no está bien hecho? 

Porques según tengo entendido está hardcodeado el mensaje del pop up que asume que el restaurante siempre da recompensa, ojo con eso

###Tarea 6

Ya tenemos el apartado de invitaciones necesito que creemos ya el apartado de referidos y agreguemos esa comunicación de trae tu referido al flujo mensual de los clientes y la necesidad de crear en el apartado correspondiendo la recompensa que se va a dar (en el apartado de recompensas para campañas agresivas, nuevo flujo de campañas, referidos) que ya no se cual es, tiene que salir un mensaje que avise tipo (para las reseñas no tienes ningun recompensa activa, si los clientes reciben pop up sin recibir ningun recompensa va a disminuir tu ratio) y estás recompensas se tienen que rastrear y salir disponibles en el celular del mesero y del cliente, para redimirlas el mesero debe escanear o validar de alguna manera obtenga la recompensa ese día el cliente o no, para dar regalo tiene que validar que el cliente haya dejado la reseña


###Tarea 7 

Ultima, en lista de prioridades no es ya, pero es importante igual, crear los pop up de google, quiero que sean nuevos para la persona, que explotemos al maximo esa capacidad de usar los pop up de google en las notificaciones del celular agregando botones, tal vez contadores de tiempo y colores para que la gente pueda tocar ejemplo, redimir recompensa y les salga una invitación para ir al restaurante etc
````
