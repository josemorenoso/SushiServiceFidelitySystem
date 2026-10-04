# Estado consolidado — requerimientos de agosto × auditoría de 1000 clientes × cola del dueño — 2026-10-04

> **Para qué sirve:** un solo lugar donde ver (1) cada cosa que el dueño pidió en agosto y si está hecha, (2) los 68 huecos
> que nombró la auditoría del 28-09 y cuáles ya se cerraron, (3) lo construido después que no estaba en ningún
> documento de requerimientos, y (4) con todo junto, **qué desarrollar primero**. Reemplaza a `docs/ESTADO-REQUERIMIENTOS.md`
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
> **Estado de despliegue al escribir esto:** `origin/main = 9a06670` (ola 0 + ESCALA-3/4). **En la rama y SIN desplegar:**
> el saludo de cumpleaños dos días antes (3 commits), y los arreglos de plantillas `9514c2b` y `0b4ec8e`. **La migración
> 00069 está escrita y SIN aplicar.** Las demás migraciones están aplicadas (dueño, 2026-09-29).
>
> **Leyenda:** ✅ hecho · 🟡 parcial · ⬜ no empezado · ⏸️ diferido a propósito · 🔁 reemplazado u obsoleto (el dueño cambió de
> idea o ya no aplica) · ❓ pregunta abierta al dueño.

---

## 0. En una pantalla

| Qué se midió | El número |
|---|---|
| **Pedidos de agosto** (§0–§25, extraídos uno por uno) | **224** → ✅ 90 hechos (40 %) · 🟡 42 parciales · ⬜ 35 sin empezar · ⏸️ 12 diferidos a propósito · 🔁 20 reemplazados u obsoletos · ❓ **25 preguntas abiertas al dueño** |
| **Auditoría del 28-09** (los 68 hallazgos, hoy) | 13 cerrados (7 en código desplegado · 3 por docs · 3 en código a la espera de una acción del dueño) · 8 parciales · 1 refutado · 1 no verificable · **45 abiertos, 13 de ellos críticos** |
| **Cola de `ESTADO.md` §3** | 31 ítems: **29 piden algo del dueño** (26 solo suyo, 3 mixtos) · 2 son código puro |
| **Hallazgos nuevos** (ni agosto ni la auditoría los vieron) | 17 → 2 críticos · 7 altos (§5) |
| **Documentos que se contradicen o mienten** | 16 puntos (§8) |

**Lo que hay que saber, en ocho líneas**

1. **Lo que se vende hoy está hecho y en producción:** QR, tarjeta con la marca, plantillas editables, sedes con permisos, escáner de
   meseros, domicilios, Golden Bullet, invitaciones con premio. Lo «sin empezar» (35) es **catálogo** —referidos, push, fatiga, tier
   máximo, multi-sede «por dentro»—, no deuda técnica.
2. **Hay dos agujeros entre marcas VIVOS hoy** (AISLA-2 y OPUS-4): el código que los cierra (la **00069**) está escrito y **sin aplicar**.
   Es un gesto del dueño de cinco minutos y es lo primero de todo. Además hay dos cosas por mirar: si los registros del Supabase
   del AIOS están abiertos (N2) y si la 00030 corrió.
3. **25 preguntas abiertas frenan trabajo que ninguna sesión puede empezar sola** (§7): referidos, push, fatiga, Black, tier máximo,
   franquicias y —la que más desbloquea— **a dónde llega el aviso diario**.
4. **De la auditoría se cerró lo urgente** (ola 0, ESCALA-3/4, la 00064, el texto de 24-72 h). **Todo lo de rastrear, implementar y escalar
   sigue abierto**: dar de alta una marca son 14 acciones manuales, y si algo falla no avisa a nadie.
5. **El mismo hueco aparece dos veces** (§4): plantillas, «nadie se entera», fatiga y duplicado, el alta. Conviene atacarlos
   **una vez, como ola**, no como ítems sueltos.
6. **Lo que ni agosto ni la auditoría vieron** (§5): el consentimiento (Ley 1581: el CSV del dashboard y los domicilios crean clientes
   «consentidos»), un envío fallido que bloquea el reintento 30 o 360 días, rutas de plantillas sin guardia de rol de marca, y la rama de
   botones del webhook de Zernio que aún espera antes de contestar.
7. **Los docs mienten en 16 puntos** (§8) y `ESTADO.md` mide 587 líneas (límite 150). Este archivo reemplaza a `ESTADO-REQUERIMIENTOS.md`.
8. **Propuesta (§9):** P0 gestos del dueño (hoy) → P1 cierres micro + CI → P2 plantillas ∥ P3 ver y avisar → P4 el alta sin cuello humano →
   P5 consentimiento y fatiga → P6 escala técnica → P7 proceso → P8 catálogo. **El orden lo decide el dueño.**

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
| §1.4 | Webhook entrante con firma, 2xx en < 5 s | ✅ | Responde antes de la IA desde ESCALA-3 (`9a06670`). **NO VERIFICADO:** el nombre real del header de firma (`x-zernio-signature` o `x-late-signature`) — falta un entrante real | D |
| §1.7 | Gestión de plantillas del dashboard sobre Zernio | ✅ | «Activar» las aprobadas (`0b4ec8e`) y el timeout de 10 s al crear con foto (`9514c2b`) **sin desplegar** | D (push) |
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
| §25-Fase2 · ESCALA-3 | Domicilios dentro del producto (OpenAI directo) · Zernio contesta antes de la IA | ✅ | `delivery.service.ts:614`; `9a06670`. **NO VERIFICADO:** `OPENAI_API_KEY` en Vercel y `delivery_default_city` de Sushi Service | D |
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
| **Escala** | **ESCALA-3** (Zernio contesta antes de la IA) y **ESCALA-4** (la analítica pagina de a 1.000) | 10-04 | ✅ `9a06670` |
| **Cumpleaños** | El saludo sale dos días antes (`BIRTHDAY_LEAD_DAYS`) | 09-24 | ⚠️ **sin desplegar** — la plantilla aprobada dice «¡Feliz cumpleaños!» y llegaría 2 días antes |
| **Plantillas** | Nombre editable en Meta · **«Activar» las aprobadas y lista real de la WABA** · timeout de 10 s al crear con foto | 09-12 · 10-02 | nombre ✅ · **`0b4ec8e` y `9514c2b` sin desplegar** |

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
| ESCALA-3 | 🔴 | Zernio espera a OpenAI antes de responder; 10 fallos apagan el webhook de TODAS las marcas | ✅ | `9a06670` (`after()`). **Residual:** la rama de botones sí/no **sigue esperando a Zernio** antes del 200 (`webhook/zernio/route.ts:260`); y si la función muere en el trabajo diferido no queda fila | C · micro |
| ESCALA-4 | 🔴 | `getFullAnalytics()` truncado a 1.000 filas en silencio | ✅ | `9a06670` (pagina de a 1.000). **Residual:** con un 500 el panel queda vacío sin aviso (el hook guarda el error, ninguna pantalla lo lee) | C · micro |
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
| ALTA-2 | 🟠 | El primer WhatsApp puede no salir sin que nadie se entere | 🔓 | `no_template_configured` viaja en el JSON y ninguna pantalla lo lee; caso real: Planeta Wings 02-10. «Activar» (`0b4ec8e`) lo resuelve a mano y **sigue sin desplegar** | C · feature |
| OPER-5 | 🟠 | `tier_unlocked` y `reward_reminder` fuera de los catálogos | 🔓 | En Zernio, subir de nivel y el recordatorio de premio **no mandan nada, nunca**. Decidir: 2 plantillas nuevas o fundir `tier_unlocked` en `points_earned_near` | D+C · feature |
| OPER-6 | 🟠 | Dos catálogos de 13 plantillas, copiados a mano, sin test que los compare | 🔓 | Ya hay deriva (`{{2}}` de cumpleaños). Fuente única (el AIOS llama al producto) o, mínimo, un test de paridad | C · ola (test: micro) |
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
| PROC-8 | 🟡 | `main` y la rama divergen por un despliegue parcial | 🟡 | Deliberado y documentado: `main` tiene 7 commits con otro SHA que la rama (mismo contenido) | |
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
| **Domicilios por Zernio** | §18.c | ESCALA-3, RASTREO-12 | 0.AUTOCHAT, ítem 7 | Contesta antes de la IA ✅; el operador no recibe confirmación ni aviso de fallo |
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
| N16 | 🟡 | `getTemplateCatalogState` llama a la WABA de Zernio en cada carga de Mensajes, sin caché (de `0b4ec8e`, sin desplegar) | `template.service.ts:166` | C · micro |
| N17 | ⚪ | El README del AIOS promete un «olvidé mi contraseña» que no existe | AIOS `README.md:277` | C (docs) |

---

## 6. La cola de `ESTADO.md` §3, clasificada

> **G** = gesto del dueño (aplicar, mirar, configurar, probar) · **D** = decisión · **C** = código que se puede construir ya.
> **29 de 31 ítems piden algo del dueño (26 solo suyo, 3 mixtos); 2 son código puro** (0.PLANTILLAS y 0.ETA). La auditoría
> contaba 18 de 31. Mucho de lo suyo es chico (mirar, confirmar, pegar), pero **no avanza sin él**.

| Ítem | Tipo | Qué hace falta | Cruza con |
|---|---|---|---|
| 0.SEGURIDAD | **G** | Pegar la 00069 + las consultas de la 00015 y la 00030. Aparte, código: SEG-2 (carrera de `resolve`) y SEG-3 (`PUT tenant-config`): prompt en `docs/prompts/2026-10-04-seg2-resolve-y-tenant-config.md` | AISLA-1/2, OPUS-4 |
| 0.ESCALA | G | Desplegado el 10-04. Mirar en los logs de Vercel que `webhook/zernio` conteste enseguida y salgan las líneas `[Delivery]` | ESCALA-3/4 |
| 0.CUMPLE | **D** | La plantilla aprobada dice «¡Feliz cumpleaños!» y llegaría 2 días antes: crear una nueva (24-48 h de Meta) ANTES de desplegar; quien cumpla en los 2 días siguientes no recibe saludo ese año | N3 |
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
6. **Fatiga:** las cinco preguntas 16.a–e (etapas, días, qué cuenta en las «6», reinicio por tiempo, ¿«escanear» incluye pedir domicilio?, backfill) y D-10.b.
7. **Black:** ¿visitas, puntos o ambos? ¿qué es el «beneficio permanente»? ¿se cae de Black? ¿hay un nivel superior? — 17.a–d y la deuda 17.b.
8. **Cumpleaños:** crear la plantilla nueva antes de desplegar (0.CUMPLE).
9. **Multi-sede:** ¿el administrador de sede ve el cubo NULL (0.DELTA)? ¿el cupo global de la mystery box pasa a ser por sede (0.GAMMA)? ¿un celular por sede (0.THETA, F9)? ¿dos premios de reseña por cliente (F10)? ¿qué teléfono de domicilios responde el auto-reply (D9)?
10. **Cobro:** política de corte por mora, pasarela (Wompi) y precio único (OPER-1, OPER-9).
11. **El AIOS:** ¿se suma un segundo operador pronto (ALTA-3, AISLA-3)? ¿alta en lote (ALTA-5)? ¿autorregistro (§11.8)?
12. **Catálogo de producto:** referidos (4.12, 4.13), push (9.2–9.5), qué pasa al superar el tier máximo (8.1), usabilidad de Campañas (15.a, 15.b), copy editable (5.6), rediseño del QR de mesa (3.2).
13. **Chicas:** el texto de confirmación de §18.c · qué muestra un subdominio sin marca · la hora de `reward-reminder` · ¿«Sushi Service Barra» qué es? (§2.1) · pasar Frangal a «Sin WhatsApp» (§21.4).

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

*(Una de las verificaciones de esta pasada dijo que `0b4ec8e` y `9514c2b` ya estaban en `main`; se comprobó con `git merge-base --is-ancestor`
y es falso: siguen sin desplegar.)*

---

## 9. Propuesta de prioridades

> **El orden es una propuesta mía; la cola la ordena el dueño** (método §3). Criterios, en este orden: (1) riesgo vivo hoy ·
> (2) lo que frena dar de alta marcas 6…25 · (3) ceguera operativa · (4) escala técnica · (5) producto nuevo.
> Tamaños: micro (< 1 h) · feature (una sesión) · ola (varias sesiones, con plan en `docs/plans/`).

| Ola | Qué entra | Por qué en este lugar | Tamaño | Necesita del dueño | Migración |
|---|---|---|---|---|---|
| **P0 · Destrabar** (hoy, ~1 h suya, cero código) | Pegar la **00069** + consultas (00015, 00030, funciones abiertas) · **revisar en Auth del Supabase del AIOS que los sign-ups estén apagados** (N2) · borrar el CSV de la raíz · mirar en la UI de n8n que está apagado (permite apagar el VPS) · `ZERNIO_API_KEY` y `ZERNIO_WEBHOOK_SECRET` vigentes · correr las consultas de duplicados de `campaign_messages` y de conteo D-8.b (insumos de P2 y P5) | Es lo único que está VIVO hoy y cuesta minutos | gestos | todo | — |
| **P1 · Cierres micro + red de seguridad** (1-3 sesiones Sonnet) | SEG-2 (carrera de `resolve`) · SEG-3 (`PUT tenant-config`) · lista cerrada de claves del `PUT settings` · AISLA-5 test · AISLA-8 · `.mcp.json` `read_only` · `.gitignore` AIOS · **N1** (el CSV deja de consentir; `res.ok` de 0.ETA) · **N3** (un fallo no bloquea el reintento) · N4 (tope a la agresiva) · N6 (sí/no después del 200) · N7/N8 (paginar y no tragar errores) · aviso en pantalla del 500 de analítica · §8.2 (`?? 150`) · §17.1b · copy de Campañas · desplegar `9514c2b` y `0b4ec8e` · **PROC-1 (CI)** | Cada uno es chico y protege lo que viene: **todas las olas siguientes son largas y un push a `main` despliega**; CI primero paga de inmediato | micro ×~14 + 1 feature | solo el texto de 18.c | ninguna |
| **P2 · Plantillas** | `0.PLANTILLAS` completo: un solo catálogo (el AIOS llama al producto) · `tier_unlocked`/`reward_reminder` (OPER-5) · rechazos y pausas con salida y rastro (RASTREO-3, N9, N5) · una sola pantalla · 13 → 8 y UTILITY · test de paridad (OPER-6) · `no_template_configured` visible (ALTA-2) | Cada marca nueva paga esta fricción; en Zernio el cruce de nivel es silencio total; el dueño lo declaró urgente el 09-12 | **ola** | decisión 4 | ninguna o 1 |
| **P3 · Ver y avisar** | Resumen diario al dueño sobre `aios_health()` · tabla de corridas de cron por marca · status callback de Twilio · tracking de errores · bitácora de auditoría · aviso de saldo bajo · log en firma inválida · contador de gasto por marca (OpenAI y Zernio) · `/salud` filtrado | Antes de pasar de 25 marcas; hoy **nada** avisa | **ola** | **decisiones 1, 2, 3** | 2-3 (corridas, bitácora, gasto) |
| **P4 · El alta sin cuello humano** | Tablero de altas con aviso a las 72 h (ALTA-4) · activación que pasa a `zernio` sola (N10) · `owner_email` obligatorio (OPER-3) · «olvidé mi contraseña» · roles y MFA en el AIOS (ALTA-3, AISLA-3) · reescribir `DELEGACION_GUIDE` y `PROCESO_VENTAS` · cobro con pasarela y corte por mora (OPER-1) | De 14 acciones manuales a las menos posibles; la meta es que otra persona dé altas | **ola** | decisiones 10, 11 | 1-2 (AIOS) |
| **P5 · Consentimiento y fatiga** | Backfill de `consent_events` y escritura en cada alta (D-8, D-9) · pausa a las «6 comunicaciones» (D-10, §16.1) · pipeline del recorrido (§16.2) | Exposición legal (Ley 1581) y calidad de la línea: la fatiga se paga en el cupo de Meta | feature + **ola** | **decisiones 5, 6** | 2-3 |
| **P6 · Escala técnica** (antes de ~100 marcas) | Crons con el patrón de `queue-drain` (ESCALA-1) · UNIQUE anti-duplicado (ESCALA-7) con índices (ESCALA-11) · opt-out en lote (ESCALA-6) · caché de host (ESCALA-8) · límite de tasa compartido (ESCALA-9) · `(select …)` en RLS (ESCALA-10) · `line-health` con presupuesto (N14) · tests de handlers de cron · **probar con 1000 marcas sintéticas en staging** | El primer cuello es `queue-drain` a ~100-150 marcas con cola; con 5 marcas no urge | **ola** | confirmar el tier de Supabase | 2-3 |
| **P7 · Proceso** | Staging (PROC-3) · registro real de migraciones (PROC-2) · tests del AIOS (PROC-5) · podar `ESTADO.md` 587 → 150 y `CLAUDE.md` 125 → 100 · borrar el worktree de Kilo · permitir `graphify.exe` | Se paga solo cuando hay varios operadores | feature + ola | PROC-6, PROC-10 | — |
| **P8 · Catálogo de producto** (el dueño ordena por valor comercial) | **Multi-sede por dentro:** F5b/F5c, F6a-c, D8, D12 (Tepuy se arma con dos sedes y las 12 sedes de otra marca ya se contemplan en 0.ALFA) · referidos (§4) · Black (§17) · tier máximo (§8.1) · push (§9) · logo/paleta en el alta y en WhatsApp (§6.2, §6.5) · Google Contactos (§25-Fase3) · franquicias (§22) · línea por sede (F9) | Son los 35 pedidos «no empezados»; la mayoría espera una respuesta del dueño (§7) | olas | decisiones 7, 9, 12 | varias |

**Lo que empezaría ya, sin esperar decisiones:** P0 y P1. **P2** también (el dueño ya la ordenó urgente). P3, P5 y P8 esperan
respuestas de §7. P2 y P3 pueden ir **en paralelo** si el planificador las parte por archivos: P2 vive en
`template.service.ts`, el catálogo y los catálogos del AIOS; P3 en `cron/*`, `aios_health()` y el status callback. Se cruzan
solo en `template.service.ts` (RASTREO-3), y ese ítem queda en P2.

---

## 10. Tu lista nueva de cambios

> *(Pendiente: el dueño tiene una lista grande de cambios nuevos que aún no está en ningún documento.)* Cuando se pegue, cada
> ítem se clasifica contra este mapa: (a) ¿ya es un pedido de agosto (§1) o una cola (§6)?, (b) ¿es un hueco de la
> auditoría (§3) o un hallazgo nuevo (§5)?, (c) ¿en qué ola cae (§9)? y (d) ¿necesita una decisión de §7?

| # | Pedido | ¿Ya existe? | Ola | Decisión previa |
|---|---|---|---|---|
| | | | | |

---

## 11. Lo que NO se pudo verificar (y quién lo resuelve)

- **Producción / base real:** que la 00069 siga sin aplicar · si la 00015 y la 00030 corrieron (consultas 2 y 3 del prompt de la ola 0) · `owner_email` de hoy · tamaño de `campaign_messages` y duplicados existentes · el tier del Supabase del producto · el valor real de `whatsapp_auto_reply_enabled` en Sushi Fun · qué marcas tienen un nivel `is_black` · si los sign-ups del Supabase del AIOS están apagados · la 00009 del AIOS · el límite de filas de PostgREST.
- **Consolas de terceros:** el build de Vercel de `9a06670` (el mensaje del commit dice READY y que un POST con firma inválida dio 401; no se vio la consola) · `OPENAI_API_KEY` y `delivery_default_city` en Vercel · si los crons corren (logs) · si n8n está apagado · el plan de Vercel (Pro) · la suscripción al evento `whatsapp.template.status_updated` en Zernio · el nombre real del header de firma de Zernio · el proveedor real de cada marca · las plantillas aprobadas por marca en Meta · `ZERNIO_API_KEY` vigente en el Vercel del producto y del AIOS.
- **De este documento:** el costo de los 10 auditores no se midió; los conteos (224 pedidos, 68 hallazgos) dependen de cómo cada auditor partió los ítems; la severidad de §5 es juicio mío; `REQUERIMIENTOS_JULIO_2026.md` y `REQUERIMIENTOS_SISTEMA.md` no se revisaron.
