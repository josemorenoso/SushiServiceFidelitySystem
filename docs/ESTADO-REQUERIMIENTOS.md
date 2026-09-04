# ESTADO DE LOS REQUERIMIENTOS — §1 a §25, auditado contra el código

> **Auditado:** 2026-09-04. Fuente: `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md`,
> verificado **contra el código**, no contra lo que dice el requerimiento.
> **Complementa** a [ESTADO.md](ESTADO.md) — ese lleva multi-sede, §25 y el camino a producción; este
> lleva el resto del encargo de producto.
> **Por qué existe:** ESTADO.md se armó sobre multi-sede y §25, y se le pasó todo lo demás — entre
> ellos §19, que el dueño recordaba y no estaba anotado en ninguna lista viva.

---

## Tabla de estado

| § | Tema | Estado | Evidencia | ¿Bloquea el deploy de mañana? |
|---|------|--------|-----------|---|
| 3 | Personalización del QR | **PARCIAL** | QR Studio existe (`dashboard/qr/page.tsx`) pero su config vive solo en `localStorage`, sin persistir en Supabase; el QR de `CustomerCard.tsx` sigue básico | NO |
| 4 | Programa de referidos | **NO EMPEZADO** | Solo `docs/features/referral-program.md`, marcado "PLAN — NO IMPLEMENTADO". Sin schema, sin endpoints | NO |
| 5 | Personalización pantalla teléfono + tarjeta | **NO EMPEZADO** | `CheckInForm.tsx` sin `useBranding()`; `EDITABLE_KEYS = ['google_maps_url']` intacto | NO |
| 6 | Branding + wizard de plantillas | **PARCIAL** | Tono/estilo ya resuelto vía §12; falta logo, paleta y el wizard | NO |
| 7 | Calendario — mensaje hardcodeado | **NO EMPEZADO** | `TEMPLATE_BODY` fijo en `scripts/twilio-create-media-templates.mjs:132`; `event_type` nunca se lee para elegir plantilla | NO |
| 8 | Puntos al superar el tier máximo | **NO EMPEZADO** | Fallback `?? 150` intacto en `src/services/points.service.ts:187` | NO |
| 9 | Notificaciones Push (FCM) | **NO EMPEZADO** | Cero infraestructura (sin firebase/vapid/fcm en `src/`) | NO |
| 10 | Housekeeping | ✅ **HECHO** | CHANGELOG v2.8.2/v2.8.3/v2.9.1; `Level 2.0/` versionada; gitlink eliminado (`4e88cf2`) | NO |
| 12 | Plantillas de WhatsApp | ✅ **HECHO** | v2.12.0, migración `00039_template_catalog.sql`, commit `e8033f3` | NO |
| 13 | Apartado de Campañas | **PARCIAL** | Sin alcance propio: absorbido y redirigido a §15/§16 | NO |
| 14 | Dashboard — limpieza | ✅ **HECHO** | Commit `f1a7921`: `BlackTierSection` movido, `TOP_CUSTOMERS_LIMIT = 15` | NO |
| 15 | Campañas — usabilidad | **PARCIAL** | Burbujas movidas y presets fantasma ocultos (`f1a7921`); el rediseño de §15.1 sin empezar, 15.b sin decidir | NO |
| 16 | Fatiga y pipeline del recorrido | **NO EMPEZADO** | Cero código; solo documentado. Preguntas 16.a–e abiertas | NO |
| 17 | Clientes Black / VIP | **PARCIAL** | Mudanza y tarjeta hechas (`f1a7921`); beneficio permanente (17.3) y umbral configurable (17.4) sin implementar. Ojo con la **17.b** ya conocida | NO |
| 18 | **Domicilios bajo coexistencia** | **NO EMPEZADO** | No existe apartado de Domicilios en el dashboard ni canal alternativo para el "cuadro" | **NO para el deploy — SÍ para el onboarding** (ver abajo) |
| 19 | **Escáner QR de meseros** | **NO EMPEZADO** | Ver ficha completa abajo | NO |
| 20 | Decisiones D-7 a D-10 | **PARCIAL** | Solo documentadas (`060ac01`, docs-only). Sin divisor de bloques Golden Bullet, sin `accepts_marketing:false` explícito en importación, `consent_events` sin referenciar en `src/` | NO |
| 21 | Panel del AIOS | ✅ **HECHO** | AIOS v1.3.0: `client_locations.platform/.messaging`, `clients.billing_mode` | NO |
| 22 | Franquicias | ⏸️ **DIFERIDO A PROPÓSITO** | El doc dice explícitamente "NO es v1"; se dejó la puerta abierta sin construir | NO |

§1, §2, §11 son contexto/arquitectura ya resueltos. §23/§24/§25 están en [ESTADO.md](ESTADO.md).

---

## §19 — Escáner QR de meseros (lo que el dueño recordaba)

**Pedido el 2026-08-30. Sin empezar y SIN SPEC** — el propio requerimiento dice "merece spec propio" y
ese spec no existe en `docs/superpowers/specs/`.

No es construir de cero: es **invertir el modelo**. Hoy el celular pertenece a un mesero
(`staff_devices.staff_user_id`); se pide que pertenezca al **restaurante** y que el mesero se elija por
operación. Los 7 puntos:

1. Un solo login por celular, con usuario/clave **del administrador**; se elimina el login por mesero.
2. Meseros de alta **solo con PIN de 4 dígitos** — sin teléfono, sin celular propio.
3. Nota de a quién pertenece el celular al activarlo (`device_name` ya existe).
4. Al escanear: mesa (ya existe) + **elegir el mesero** → habilita métrica de escaneos por mesero.
5. Al entregar premio: **"Redimir ahora" o "Acumular"**.
6. Al redimir: elegir quién redime + mesa + **exigir su PIN**.
7. Ese PIN debe poder **activarse/desactivarse** desde el apartado de escaneo.

**Verificado contra el código: no existe nada de esto.** `staff_users.phone` sigue `NOT NULL UNIQUE`
(`00018:12`), el login sigue pidiendo teléfono+PIN por mesero, no hay "Redimir/Acumular", no hay PIN
configurable.

### ⚠️ Choque con F4 — decidir ANTES de implementar

El punto 2 (el teléfono deja de ser obligatorio) **rompe D11**. El constraint
`staff_users_phone_tenant_key (phone, tenant_id)` es, según `CLAUDE.md`, *"D11 en el motor"*: es lo que
garantiza a nivel de base que un mesero pertenece a UNA sede. Si el teléfono pasa a ser opcional, ese
UNIQUE deja de proteger nada — **en Postgres los NULL no colisionan entre sí** — y la garantía
desaparece sin que nadie se entere. Hace falta otra llave de identidad del mesero antes de tocar esto.

### Decisión de diseño ya tomada (no la "arregles" después)

Textual del dueño: *"sí se podrán registrar QR a nombre de otros meseros pero nadie lo va a hacer
porque es una estupidez regalar tu premio a otro"*. **La atribución del escaneo NO se protege con PIN;
solo la redención.** Está registrado a propósito para que nadie lo trate como un bug.

### Preguntas abiertas de §19

19.a login de admin: ¿el mismo del dashboard o uno aparte para los celulares? · 19.b ¿qué pasa con los
meseros que ya existen con teléfono y PIN: migración o alta de cero? · 19.c con el PIN desactivado,
¿igual se elige mesero para la atribución? · 19.d "Acumular": ¿el premio queda indefinido o mantiene la
ventana de vencimiento actual? · 19.e ¿cuántos intentos de PIN antes de bloquear?

---

## §18 — Domicilios bajo coexistencia: matización importante

El barrido lo marcó como bloqueante. **Matizado tras leer la sección completa: no bloquea el deploy de
mañana, pero sí bloquea el onboarding de los 25 bajo coexistencia.**

- **No bloquea el deploy** porque el mecanismo actual sigue funcionando: el requerimiento mismo dice
  que el cuadro se distingue por `authorized_numbers` y *"eso sigue funcionando"*. Sushi Service está
  en Twilio y su flujo no cambia.
- **Sí bloquea el onboarding** porque con coexistencia el cuadro del pedido cae en la **misma línea**
  por la que el restaurante habla con sus comensales, y el webhook de Zernio **no puede responder texto
  libre**, así que la confirmación al operador no funciona como con Twilio.

Preguntas 18.a–d marcadas *"bloqueantes, ninguna asumible"*: por dónde entra el cuadro, si
`authorized_numbers` basta para distinguirlo, qué se le responde al operador en Zernio, y qué debe
contener el apartado nuevo de Domicilios.

---

## Preguntas abiertas al dueño, sin responder

Ninguna bloquea el deploy. Todas bloquean el trabajo que venga después.

| Tema | Pregunta |
|---|---|
| §18.a–d | Domicilios bajo coexistencia — **las más urgentes para vender a los 25** |
| §19.a–e | Escáner de meseros (arriba) |
| §16.a–e | Etapas y días del pipeline de recorrido/fatiga |
| §17.a–d | Qué es el "beneficio permanente" Black, con qué umbral, y si Black es el tier máximo |
| §3 | La queja de "QR muy básico", ¿es sobre el QR Studio (mesa) o el de la tarjeta? |
| §15.b | Los 2 presets fantasma (`invite_restaurant`/`invite_delivery`): ¿borrar o crearles plantilla? |
| §12 | El emoji 🍣 horneado en los textos "cálido" para tenants que no son japoneses |
| §5 | ¿Quién edita la personalización de pantalla, y hace falta `logo_url` persistente? |
| §9 | Push: ¿para el cliente final o para staff? ¿Qué caso lo justifica? |

---

## Lectura de todo esto

**Nada de lo anterior bloquea el deploy de mañana.** El producto que se despliega está completo y
verificado para el caso de uso actual.

Lo que sí conviene ver con calma: de las 20 secciones auditadas, **5 están hechas, 6 parciales y 7 sin
empezar**. Las sin empezar son funcionalidades de producto (referidos, push, fatiga, branding,
escáner), no deudas técnicas. El sistema **funciona**; lo que falta es catálogo.

Para el objetivo declarado —*recibir más clientes*— las dos que más pesan son **§18** (sin ella el
onboarding con coexistencia no tiene respuesta clara) y **§19** (hoy cada mesero necesita su propio
número y su propio login: para un restaurante con 8 meseros son 8 altas, y eso multiplicado por 25
clientes es fricción real de venta).
