# PENDIENTES — todo lo que falta, en un solo lugar

> **Última actualización:** 2026-10-12 (**PL-2-a cerrada**: sale de §3.2 —el recordatorio de premio y «Nivel desbloqueado» del check-in ya no usan una plantilla Twilio sin aprobar—; PL-2 queda con los dos emisores que no preguntan; **la 00070 pasa a aplicada** el 12-10). Antes 2026-10-11 (**ciclo, fase 1A HECHA**: sale de §1 y de §2.4, entra lo que deja para la 1B en §2.4 y dos chicos en §5, TEST-deadlock y N-MES). Antes, el mismo día (**el dueño DECIDIÓ los bloques A y B y parte del C** con datos de producción: §8 queda como tabla de decisiones; feature nueva «se adapta a tu clientela», `docs/features/ritmo-adaptativo.md`; prompt de la fase 1A listo). Antes, el mismo día (P1-a: salen N3-quater, N7, N8 de §5 y N5, N16, N23, OPER-4, OPER-6 de §3.3; entran N5-bis, N23-bis y OPER-4-bis; OPER-6 encontró **cuatro** punteros fuera del catálogo, no dos). Antes 2026-10-10 (ciclo fase 0.bis: sale N3-bis y N3-ter de §5, entran N3-quater y N3-quinquies; la consulta de la fase 0 ya corrió y su gesto pasa al de Planeta Wings). Antes 2026-10-08 (Opus 5.5, solo docs). **Es la puerta de entrada a lo que falta.** Si algo
> pendiente no está aquí, no está pendiente: o se hizo, o hay que agregarlo aquí.
> **Regla:** lo que se termina se **saca** de este archivo (no se tacha) y pasa al `CHANGELOG.md`. El detalle de cada
> cosa vive en su documento de origen; aquí va una línea, el estado y dónde leer más.
> **Prioridad del dueño (2026-10-08, textual):** *«tenemos como prioridad número 1 el corregir las campañas, mejorar el
> área de plantillas y optimizar un poco más todas las cosas»* y *«no quiero que ni una sola sugerencia y cambio
> pendiente se pierda»*.

---

## 0. Qué documento sirve para qué

| Documento | Para qué sirve | Estado |
|---|---|---|
| **`docs/PENDIENTES.md`** (este) | La lista única: qué falta, en qué orden, qué decide el dueño | **Vigente. Empezar aquí** |
| `ESTADO.md` | El tablero de sesiones vivas (§2) y la foto del despliegue (§1). La cola de gestos del dueño por marca (§3) | Vigente |
| `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md` | **El diseño de las campañas nuevas** (el ciclo). Cuatro pasadas: la original, la revisión del dueño (§12), la verificación del 08-10 (§13) y las decisiones con datos del 11-10 (§14) | Vigente; fases 0, 0.bis y 1A construidas |
| `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-mockup.html` | El prototipo clicleable (v2). Publicado en <https://claude.ai/artifact/EKRPox4mCdvsSwiGbETDB5> | Vigente |
| `docs/prompts/2026-10-04-ciclo-fase-0-y-1.md` | El prompt para construir las fases 0 y 1 del ciclo | Listo, con las correcciones del 08-10 |
| `docs/PENDIENTES-PLANTILLAS.md` | El diagnóstico de plantillas: nueve fallas y un plan de ocho pasos | Vigente (el plan sigue «sin decidir»: §3 de aquí) |
| `docs/prompts/2026-09-12-plantillas-una-por-una.md` | El prompt de la parte urgente de plantillas (adoptar lo que ya está en la WABA) | Su punto 1 sigue pendiente |
| `docs/ESTADO-CONSOLIDADO-2026-10-04.md` | El inventario completo: los 224 pedidos de agosto, los 68 hallazgos de la auditoría, los 23 nuevos (N1–N23), tu lista de septiembre (§10, texto original en el Anexo A) | Vigente como **detalle**; las preguntas viven ahora en §8 de aquí |
| `docs/AUDITORIA-ESCALA-1000-2026-09-28.md` | Los 68 hallazgos con su evidencia | Detalle |
| `docs/RUNBOOK-DEPLOY.md` | El despliegue paso a paso | Vigente |
| `docs/ESTADO-REQUERIMIENTOS.md` | Reemplazado el 04-10 por el consolidado | **No usar** |

---

## 1. El orden de trabajo propuesto (tu prioridad 1 primero)

> Es una propuesta. El orden lo decides tú. Cada fila es una sesión de trabajo salvo que diga otra cosa.

| # | Qué | Necesita de ti antes | Migración |
|---|---|---|---|
| 1 | **Gestos de hoy** (§6.1): ~~la 00069~~ (aplicada el 11-10), mirar los registros del Supabase del AIOS | Nada: solo hacerlo | — |
| 2 | ✅ **Campañas, fases 0 y 0.bis: HECHAS el 2026-10-08 y el 2026-10-10** (sin migración; **pusheadas juntas a `main` el 2026-10-11, `2746d49`**). Un envío fallido ya no bloquea 30 o 360 días, pero cada toque admite 3 fallidos y no más · la insistente sale una vez mientras el cliente no vuelva · `error_message` dice la causa real · el texto de Campañas dice la verdad · una sola escala de días, también en Clientes y en «Rescatar Perdidos» | Nada. Línea base del SQL en `ESTADO.md` 0.CICLO; repetir la consulta hacia el 2026-11-11 | no |
| 3 | ✅ **Plantillas: un solo libro y una sola pantalla — HECHO el 2026-10-11** (sin migración, **sin desplegar**): el panel reconoce la WABA, las tres plantillas nuevas entraron juntas, una pantalla para Twilio y Zernio, Biblioteca para campañas (§3). Quedan B1 y B7 (AIOS, menos aprobaciones), en una sesión posterior | Desplegar; después, por marca, «Enviar los N juntos a Meta» (§3.4) | no |
| 4 | **Campañas, fase 1B: los envíos del ciclo** (cron que decide y encola, drenador que otorga al enviar, «vence el domingo», piloto en Don Alirio). La **1A (la base) está HECHA** (2026-10-11, migración **00070 aplicada por el dueño el 12-10**, `CHANGELOG.md`): lo que deja para la 1B, en §2.4 | De la 1A (`ESTADO.md` 0.CICLO): traer los resultados de las consultas 1 y 2 de `SQL-PARA-CORRER/ciclo-fase-1a/` y ordenar el push (la 00070 ya está aplicada). La 1B lleva prompt aparte del comandante | 0 o 1 |
| 5 | **Recompensas en un solo lugar** (S-1) | Nada: C1–C3 ✅ decididas | 0 o 1 |
| 6 | **Campañas, fase 2: la pantalla** (dos o tres sesiones) | A8: mirar el prototipo (no frena la fase 1) | no |
| 7 | **Optimizar: los arreglos chicos** (§5), repartidos en una o dos sesiones | Solo el texto de 18.c | no |
| 8 | **La tarjeta, las reseñas y los referidos** (§4.2) | C4–C8 | 1–2 |
| 9 | Campañas, fase 3: afinar con datos (un mes después de la fase 1) | Leer el reporte | no |
| 10 | Lo demás, por olas (§7) | §8, bloque D | varias |

**La 1A y las plantillas (fila 3) corrieron en paralelo el 11-10** sin cruzarse más que en `src/lib/settings-keys.ts` (quedó de la 1A). **2 y 3 pueden ir en paralelo** (no comparten archivos). **3 y 4 se cruzan** en `template-catalog.ts` y `template-texts.ts`:
por eso la plantilla nueva del ciclo («Regalo que vence») entra en la sesión 3, junto con las otras tres, y la 4 ya la
encuentra hecha. **5 y 6 se cruzan** en `campaigns/page.tsx` (la pestaña «Premios»): 5 va primero.

---

## 2. Campañas: el ciclo de recuperación

**Estado:** diseñado y revisado cuatro veces (la cuarta, el 11-10, con datos de producción: spec §14). **Las fases 0 y
0.bis están DESPLEGADAS** (`2746d49`, 11-10). **La 1A, la base del motor, está construida** (11-10, migración 00070
**aplicada por el dueño el 12-10**, nada se envía). Falta la 1B (los envíos) y de ahí en adelante.

### 2.1 Qué hace el diseño, en cinco líneas

1. Cada cliente recorre un ciclo desde su última visita: **cinco toques** con huecos crecientes («Le recordamos», «Le
   regalamos algo», «Le mostramos lo otro», «Rescate», «Despedida»). Los días salen del **ritmo de cada cliente** (con 3+
   días de visita) o, si es nuevo, del de la marca, calculado con sus datos (`docs/features/ritmo-adaptativo.md`).
2. **A los 6 mensajes sin volver, para.** Cuentan los tuyos (manuales y eventos). Pasa a «dormido»: un toque cada tres
   meses (máximo dos) y el cumpleaños.
3. **Toda visita reinicia el ciclo** (QR, mesero o domicilio) y anota qué mensaje lo trajo.
4. **Una sola plantilla nueva**, «Regalo que vence», con el regalo y la fecha como variables. Mientras no esté aprobada, sale
   la insistente de siempre y el regalo igual llega a la tarjeta.
5. **La pantalla abre con «Para hoy»**: dos o tres tarjetas armadas que apruebas con un botón. Debajo, seis cajas por etapa
   (nuevos y ya volvieron) y el calendario como el mismo dato girado.

### 2.2 Tu revisión del 04-10: los 14 cambios, todos aplicados al spec

Verificado el 08-10 punto por punto contra el spec (§12 de él) y el prototipo v2. **Ninguno se perdió.**

| # | Lo que pediste | Dónde quedó en el spec |
|---|---|---|
| 1 | De «crear» a «aprobar»: tarjetas armadas con botón; las fechas especiales como tarjetas | §6.1, §10 |
| 2 | Vocabulario de dueño; «archivado» no aparece; el cupo sale de la portada | §6.6, §5 |
| 3 | Seis cajas (nuevos / ya volvieron) en vez del histograma de 91 barras | §6.2 |
| 4 | Un solo ajuste: el ritmo del negocio | §3.2.bis (**ver §2.3, H1: dos ritmos hay que corregirlos**) |
| 5 | Primer uso: tres pasos con barra y estado real de la plantilla | §6.0 |
| 6 | El adaptador a la insistente como ruta por defecto, dicho en pantalla | §4 |
| 7 | Sin modal: abrir en «mandar un regalo»; el evento con texto ya escrito | §6.5 |
| 8 | El evento manda sobre el toque (pausa en el blackout) | §3.3 regla 5 (la premisa se corrigió: ver spec §12) |
| 9 | Toque trimestral: pequeño primero, fuerte después (esquiva el cooldown) | §3.5 |
| 10 | «Le mostramos lo otro» solo si la marca tiene domicilio | §3.2 |
| 11 | Hora por marca (almuerzo/cena) y «vence este domingo» | §5 (**ver H3: el almuerzo, como está, no funciona**) |
| 12 | Grupo de control desde la fase 1 | §3.4, §7.1 (**ver H4 y H5**) |
| 13 | «Regalo que vence» en vez de «invitación» | §4 |
| 14 | Mensaje libre como salida de emergencia con fecha de caducidad | §6.5, §9 #14 |

### 2.3 Lo que encontré el 08-10 al verificar el diseño contra el código (tercera pasada)

Siete problemas. Ninguno cambia la idea; todos romperían algo en la construcción. Ya están corregidos en el spec (§13) y
en el prompt de la fase 1.

| # | Problema | Evidencia | Arreglo propuesto |
|---|---|---|---|
| **H1** | **Los ritmos «cada semana» y «cada quince días» rompen tu regla de 3 mensajes al mes.** El spec dice que los cuatro cumplen; con «vence este domingo» el recordatorio del rescate cae en un día variable y a veces es el cuarto mensaje del mes. El tope del código lo frena: **ese cuarto mensaje no sale y nadie se entera** | Simulación de 365 fechas de visita contra el tope real (`getCustomersAtMonthlyCap`, por mes calendario): semanal pasa de 3 en 43 de 730 casos; quincenal en 4 | Semanal **7 · 14 · 26 · 42 · 58** y quincenal **10 · 17 · 29 · 45 · 61** (los dos pasan en los 730 casos, con huecos crecientes). Mensual y ocasional se quedan. **El validador de la fase 1 tiene que ser esa simulación, no una cuenta a mano** |
| **H2** | **El recordatorio de vencimiento sale para cualquier regalo con fecha, también el pequeño.** El spec solo contó el del rescate. Con los dos, **ni el ritmo mensual cumple** (65 de 730 casos) y ningún ritmo de huecos crecientes cabe | `findGrantsDueForReminder()` no filtra por origen (`reward-grant.service.ts:285`) | El recordatorio solo para el **regalo fuerte** (rescate y segundo trimestral). El pequeño vence sin aviso. Es la decisión **A3** |
| **H3** | **El horario de almuerzo no puede salir el mismo día.** El spec dice que el cron corre a las 10:00 de Bogotá; corre a las **15:00** (`vercel.json`: `0 20 * * *` UTC). A esa hora el almuerzo de hoy (10:30) ya pasó y el mensaje saldría de inmediato, a las 15:00 | `vercel.json`, spec §5 | Si la hora de la marca ya pasó, el mensaje sale **al día siguiente** a esa hora. La cena (16:30) sigue saliendo el mismo día. Sin tocar los crons |
| **H4** | **El grupo de control dejaría a las mismas personas sin rescate para siempre.** El sorteo es por cliente y etapa, igual en todos los ciclos: el 10 % que cae fuera del rescate en el ciclo 1 cae fuera en todos | Spec §7.1 (`isHoldout(customerId, stage, pct)`) | Sortear por cliente, etapa **y número de ciclo** |
| **H5** | **El grupo de control nunca se podría medir.** La atribución busca toques con `sent_at` en los 14 días previos, y a un cliente de control no se le envía nada: su `sent_at` queda vacío | Spec §3.4 y §7.1 | Una columna `due_at` (cuándo le tocaba) que se llena en los dos casos; la atribución usa `due_at` |
| **H6** | **Un toque cancelado en la cola queda colgado para siempre.** El drenador cancela un envío si el cliente recibió otra campaña o llegó al tope del mes, pero el diseño solo define qué pasa al enviar o al fallar. El toque se quedaría «en cola», y la regla de uno por etapa y ciclo impediría reintentarlo | `queue-drain/route.ts:463, 497` (`cancelQueueItem`) | El drenador escribe el resultado en el toque **en todos los casos**. Cancelado por el cap de 7 días → se reintenta en 7 días. Por el tope del mes → al mes siguiente si sigue dentro del ciclo |
| **H7** | **Encender el ciclo sube el volumen de mensajes de las 25 marcas el mismo día del deploy.** Hoy un cliente perdido recibe uno o dos mensajes al mes; con el ciclo, cinco toques más los trimestrales. Es más costo en Twilio y más carga de la línea, y lo dispararía un deploy, no tú | Regla de la casa: ningún servicio externo se dispara sin que el dueño sepa | Un interruptor por marca. Default propuesto: **una marca piloto dos semanas** y después las demás. Es la decisión **A5** |

Y dos cosas que el spec dejó abiertas:

- **Las tarjetas «Para hoy» de lo automático** («31 dormidos reciben su toque mañana: OK · Hoy no»): ¿sale solo si no
  tocas nada, o nada sale sin tu OK? Para un dueño que no entra al panel, lo primero. Es la decisión **A6**.
- **La pestaña «Premios» sigue dentro de Campañas** en el spec (§6.7) y tú la pediste en Recompensas (Tarea 1). Es la
  decisión **A7**: el default propuesto es tu pedido.

### 2.4 Las fases, con lo que falta de cada una

| Fase | Qué | Estado |
|---|---|---|
| **1B · Los envíos** | El cron que decide y encola · el drenador que otorga al enviar · «vence el domingo» · el adaptador a la insistente · las correcciones H2, H3, H6 · encender el piloto en Don Alirio. **Dos reglas de la revisión de la 00070 (comandante, 12-10):** (1) **al encender una marca no se manda nada atrasado**: el backfill dejó a cada cliente en el día en que ya está, así que el cron solo envía el toque cuyo día llega desde el encendido, nunca los que ya pasaron (si no, el día del encendido salen ráfagas de toques viejos); (2) **quien ya pasó el último toque de su ritmo sin estar dormido** (ej. Don Alirio, ritmo cafetería con despedida al día 58: los clientes entre el día 58 y el 90 quedaron activos) pasa a dormido al encender, sin mensaje: su próximo contacto es el trimestral | ⬜ Lista para su prompt: la 1A está hecha (abajo) |

**Lo que la 1A (2026-10-11) deja decidido o abierto para la 1B** (detalle en `CHANGELOG.md` y en la 00070):

- **Sin ráfaga también al encender.** `resolveStage()` dice en qué etapa ESTÁ un cliente (la última cuyo día llegó), no
  si hay que mandarle algo hoy. El backfill solo evita la ráfaga del día del despliegue; al encender una marca, un
  cliente que ya está entre dos etapas no debe recibir de golpe la que pasó (spec §3.8: «el del día 42 verá el rescate
  el día 60»). La regla (enviar solo en el día de la etapa, o con un margen) es de la 1B.
- **La despedida duerme al cliente** (spec §3.5), y eso no lo hace ningún trigger: el trigger de fatiga solo cuenta. Al
  enviar `t5`, el drenador pasa al cliente a `dormido`. Igual `heartbeats_sent` y `strong_offer_last_at`: los escribe
  la 1B al enviar.
- **`cycle_no` es la llave de los toques, no un contador de visitas** (el backfill puso 1 a todos; quien se registra
  sin visita abre el ciclo 2 en la primera). La caja «nuevos / ya volvieron» de la fase 2 se arma con `total_visits`.
- **Un toque `queued` cuyo cliente volvió** antes de que salga: el drenador tiene que mirar si el `cycle_no` del toque
  sigue siendo el del cliente (H6 habla del cap y del tope; esto es lo mismo con la visita).
- `cycle_stage_days` (días a mano, «avanzado», spec §7.4) **no entró** en las claves: el prompt de la 1A no lo pedía y
  sin pantalla no tiene quién lo escriba. Si entra, `validateStageConfig()` ya está para validarlo.
| **2 · La pantalla** | Primer uso · «Para hoy» · seis cajas · vista por fecha con proyección y fechas especiales · mandar un regalo en tres campos · evento con texto sugerido · el calendario redirige · mini-ciclo en el panel · se retiran las burbujas y las cuatro tarjetas | ⬜ Espera A7–A8 y el prompt (se escribe cuando mires el prototipo) |
| **3 · Afinar** | El calibrador que sugiere el ritmo · regalos pequeños que rotan · reporte «con mensaje contra sin mensaje» por toque · texto del evento con el LLM | ⬜ Un mes después de la fase 1 |
| **4 · Futuro** | Fechas especiales completas por rubro · ruleta · sorteos y rifas · cliente del mes · Instagram · «cumpleaños del restaurante» y «datos curiosos». **Cada una es una pieza nueva del motor de 1A** | ⬜ Decidido: después de las fases 1 y 2 |

**Lo que tienes que hacer tú por la 1A, ya:** traer los resultados de la consulta 1 y de la consulta 2 de
`SQL-PARA-CORRER/ciclo-fase-1a/LEEME.md` y ordenar el push. La 00070 **ya está aplicada** (12-10, «00070 corrida»; el
resultado `OK 00070` no se vio desde el repo). **Cuando llegue la 1B:** crear «Regalo que vence» en cada marca (o
dejar que salga con la insistente) · elegir el regalo pequeño y el fuerte de cada marca (o ninguno). El ritmo no se
contesta: lo calcula el sistema; se puede cambiar en Ajustes cuando exista la pantalla.

### 2.5 Lo que el diseño mide para saber si funciona

Retorno por toque a 14 días, con mensaje contra sin mensaje · segunda visita (ciclo 1 que abre el ciclo 2 en 60 días) ·
retorno antes de dormirse · reactivados desde dormido · opt-outs por cada 1.000 mensajes (meta < 5) · regalos otorgados,
redimidos y vencidos por etapa (conteos, nunca pesos) · cuántos envíos manuales salieron por «mandar un regalo» y cuántos
por «mensaje libre». Detalle: spec §11.

---

## 3. Plantillas

**Estado (2026-10-11):** el «un solo libro» del producto está construido, sin migración y **sin desplegar**
(prompt `docs/prompts/2026-10-11-plantillas-un-solo-libro.md`; `docs/features/whatsapp-templates.md`): el panel
reconoce lo que ya está en la WABA y un 400 «ya existe» adopta; «Nivel desbloqueado», «Recordatorio de premio» y
«Regalo que vence» entraron juntas al catálogo (16); Plantillas es UNA pantalla para Twilio y Zernio y Ajustes ya no
asigna punteros (OPER-4-bis cerrado); hay Biblioteca para campañas y las marcas Zernio crean libres (B4, B5); las
rutas Twilio exigen alcance de marca (N5-bis). Lo que queda:

### 3.1 El plan, en orden (de `PENDIENTES-PLANTILLAS.md` §3)

| # | Qué | Quita | Estado |
|---|---|---|---|
| 1 | **El AIOS deja de crear plantillas** y le pide al producto que las cree (`submitSuggestedTemplate()`). Muere la copia de textos del AIOS —que NO tiene las tres del 11-10—, el sondeo manual y el paso 5 | Dos catálogos (1.1, 1.4) | ⬜ · decisión B7, otra sesión |
| 4 | **Reducir de 16 a menos aprobaciones por marca**, con la variación en variables | 1.5 | ⬜ · decisión B1, otra sesión |
| 5 | **Probar UTILITY** en bienvenida, puntos, premios, recordatorio y «Regalo que vence», en Sushi Fun | 1.6 | ⬜ · decisión B2 |
| 6 | **Rechazos y pausas con salida:** el motivo traducido a una acción y el editor abierto con el texto rechazado. Ya se VEN (motivo y «Pausado por Meta» en la fila); falta traducirlos y avisar | 1.7 | ⬜ |
| 7 | **Mostrar lo que no salió:** fallos por plantilla en Mensajes; el escáner le dice al mesero «este cliente no recibió WhatsApp» | 1.8 | ⬜ |
| 8 | Fundir los cuatro docs de plantillas en uno | 1.9 | ⬜ |

### 3.2 Lo que dejó «un solo libro» (2026-10-11)

| ID | Qué | Estado |
|---|---|---|
| PL-1 | Varios avisos dicen todavía «configúrala en Ajustes» (`calendar.service.ts`, `EventDetailDrawer.tsx`, `calendar/page.tsx`, `campaigns/page.tsx`, el log del check-in y el cron de reactivación). Ajustes conserva una tarjeta que lleva a Plantillas, así que no mienten del todo; cambiarlos a «Plantillas» toca archivos ajenos (los crons: nadie los toca) | ⬜ micro |
| PL-2 | En **Twilio** el puntero se escribe al CREAR (`fillEmptyPointer()`, deliberado desde v2.15.0). Los presets, el cron de cumpleaños, el cron `reward-reminder` y el check-in (solo «Nivel desbloqueado», al cruzar de nivel) **ya preguntan si está aprobada** (PL-2-a, 12-10: si no, ese día no se intenta y el check-in cae a «puntos sumados»). **Quedan dos emisores de «Nivel desbloqueado» que no preguntan:** el check-in manual del panel (`api/dashboard/check-in-override/route.ts`) y el registro de un domicilio (`services/delivery.service.ts`): en una marca Twilio con la plantilla en revisión mandan igual y Meta lo rechaza (un mensaje perdido, sin reintento ni tope) | ⬜ · o se les copia la pregunta (el helper son 3 líneas, ver `punteroAprobado()` del cron), o se decide que el puntero se escriba «solo al aprobarse» (necesita guardar la pendiente Twilio en `template_versions`), que las resuelve a todas |
| PL-3 | Reemplazar una plantilla **Twilio rechazada** no tiene botón propio: se crea una corregida en la Biblioteca y se elige con «Elegir otra» | ⬜ micro |
| PL-4 | Una plantilla libre no deja registro de quién la creó (no tiene fila en `template_versions`) | ⬜ · decisión |

### 3.3 Tu Tarea 2 (S-2) y los defectos sueltos

| ID | Qué | Estado |
|---|---|---|
| S-2.2 | Las automáticas «no se tocan, se usa la misma, se modifica si hace falta» | 🟡 (Zernio sí; Twilio elige, no edita: decisión 6) |
| S-2.4 | **Restricción tuya: no rediseñar cómo se ven** («me encanta cómo se ven ahora») | regla |
| N23-bis | El envío manual solo rellena nombre, puntos y próximo premio (la paginación de N23 se cerró en P1-a) | ⬜ micro |

### 3.4 Plantillas que cada marca tiene que mandar a Meta (gestos, no código)

- **Un solo viaje por marca (B6):** Plantillas → Mensajes automáticos → leer los textos nuevos («Nivel desbloqueado»,
  «Recordatorio de premio», «Regalo que vence») y **«Enviar los N juntos a Meta»**, que manda también «Cumpleaños — dos
  días antes» si falta. Planeta Wings (Zernio; Tepuy cuando tenga su número) y Sushi Service, Sushi Fun, Don Alirio, Frangal y demo-ventas
  (Twilio): el mismo botón. Al abrir la pantalla de Planeta Wings, lo que el AIOS dejó en su WABA se registra solo.
  (`ESTADO.md` 0.PLANTILLAS)
- **Plantillas de evento con imagen** en las marcas Twilio: el cuerpo corregido (22 palabras) está en `docs/PLANTILLAS.md`
  § Plantilla 12. Al aprobarse, se elige en Plantillas → la fila del evento → «Elegir otra» (ya no hace falta pegar el
  `HX…` por SQL). (`ESTADO.md` 0.IOTA punto 6)
- **Golden Bullet**: los tres textos y la plantilla (24-48 h). (`ESTADO.md` 0.GB)

---

## 4. Recompensas, tarjeta, reseñas y referidos

### 4.1 Recompensas en un solo lugar (tu Tarea 1, S-1)

Hoy los premios viven en **cuatro** lugares: Recompensas (niveles, invitaciones, redenciones) · Campañas → Premios (el
catálogo de campaña) · Ajustes (premio de la agresiva, de la reseña, puntos, Black) · el texto libre de cada invitación.
Crear el premio de la reactivación agresiva cuesta **cuatro pantallas**, y la tarjeta «Activa» de Campañas no se entera.

| ID | Qué | Estado |
|---|---|---|
| S-1.1 / S-1.3 | Sacar «Premios» de Campañas y llevarlo a Recompensas | ⬜ · micro/feature · decisión A7 y C1 |
| S-1.2 | Que Recompensas maneje todo: fijos, temporales, cajas misteriosas | ⬜ · ola · decisiones C2 y C3 |
| — | Los topes globales de la caja misteriosa no tienen pantalla | ⬜ |
| 0.ZETA | `rewards` y `campaign_rewards` recibieron sede y nadie la lee | ⬜ · decisión D5 |

### 4.2 La tarjeta, la pantalla posterior, las reseñas y los referidos (Tareas 3 a 6)

| ID | Qué | Estado |
|---|---|---|
| S-3 | Qué pasa al llenar las 10 visitas: cambio de color, estrellas por nivel | ⬜ · decisión C4 |
| S-4 | Eliminar la pantalla que aparece tras el escaneo. **Primero hay que mover la elección de premio o caja misteriosa**, que solo vive ahí | ⬜ · decisión C5 |
| S-5.2 | Reseñas: no hay interruptor «dar recompensa sí/no»; es un desplegable vacío | ⬜ micro · decisión C6 |
| S-5.3 | El paso 2 del pop-up dice «Redime tu regalo» aunque no haya premio, y el texto de Ajustes también | ⬜ micro |
| N19 | Si el premio de la reseña falla, el cliente queda sin premio y sin pop-up para siempre (se sella antes de otorgar) | ⬜ micro |
| S-6 | Referidos: el apartado, «trae a tu amigo» en el flujo mensual, la recompensa y su validación | ⬜ ola · decisión C7 |
| S-6.4 | Aviso de «recompensa faltante» (reseña, agresiva, referidos) | ⬜ micro |
| S-6.6 | El mesero solo ve clientes que vinieron en las últimas 6 horas | 🟡 |
| N20 | La tarjeta roja muestra los puntos de antes del escaneo | ⬜ micro |
| N21 | La tarjeta Black vive en `/tarjeta`, a la que nada enlaza | ⬜ micro |
| N22 | El banner «Disponible» no etiqueta las invitaciones | ⬜ micro |
| S-7 | «Pop-ups de Google» en el celular (tú: «no es ya, pero es importante») | ⬜ ola · decisión C8 |

---

## 5. Optimizar: los arreglos chicos (ola P1)

Cada uno es menos de una hora. Juntos protegen todo lo que viene.

| ID | Qué | Por qué importa |
|---|---|---|
| N1 | El «Importar CSV» crea clientes que aceptan marketing; los domicilios también nacen «consentidos» | Ley 1581 · decisión D4 |
| N3-quinquies | La causa real del fallo (fase 0.bis) se lee de `message_logs`, cuyo INSERT es *best-effort* (`recordMessageLog()` traga su error). Si esa fila no se escribió, `error_message` dice solo el proveedor. Y `campaign_messages` no guarda el premio: el tope de reintentos del recordatorio suma los fallos de dos premios del mismo cliente que venzan a la vez | Diagnóstico incompleto en un caso raro |
| TEST-flaky | El 2026-10-11 la suite dio «1 archivo falló» con los 1.017 tests en verde, 1 de 4 corridas, y no se repitió. Un archivo que falla al cargar (no un test) apunta al arranque del Postgres embebido o a un import. Si vuelve a pasar, guardar la salida completa de vitest | Una suite que miente a veces enseña a ignorarla |
| TEST-deadlock | `tests/db/ola0-seguridad.test.ts` pega la 00015 (DDL sobre `customers` y después `visits`) en la base compartida mientras otros archivos corren en paralelo; un `INSERT INTO visits` suelto de otro archivo toma `visits` y pide `customers` por la FK, y Postgres mata a uno («deadlock detected»). Lo destapó la 1A el 11-10 (2 de 3 corridas) y se resolvió ordenando las escrituras de `cycle-triggers.test.ts`; el arreglo de raíz es una línea en ola0: `LOCK TABLE customers, visits IN ACCESS EXCLUSIVE MODE` al empezar su transacción | Otros archivos que insertan visitas (`aios-health`, `multisede-*`) pueden pegarle igual, aunque menos |
| N-MES | `getMonthBoundaries()` (`campaign.service.ts`) corta el mes con la hora del SERVIDOR (UTC en Vercel), no la de Bogotá: un envío entre las 19:00 y las 23:59 del último día del mes cuenta para el mes siguiente. Hoy no muerde (los envíos salen a las 10:30–16:30), pero el tope de 3 al mes del ciclo se apoya en esa cuenta | El validador de la 1A simula por mes calendario: si los envíos se mueven a la noche, mide otra cosa que el tope real |
| N6 | Los botones sí/no del webhook de Zernio esperan 10 s antes de contestar | El mismo riesgo de apagón que se cerró en ESCALA-3 |
| N13 | El PIN del supervisor no tiene límite de intentos | Seguridad |
| N18 | Un test de la analítica contra el Postgres real (el 500 del 04-10 lo habría cazado) + CI (PROC-1) | Cada push a `main` despliega |
| SEG-2 · SEG-3 | La carrera de dos `resolve` simultáneos · `PUT tenant-config` abierto a un administrador de sede | Prompt listo: `docs/prompts/2026-10-04-seg2-resolve-y-tenant-config.md` |
| 0.ETA | La importación de CSV cuenta como importados los que la base rechazó | Con 2+ sedes reporta éxito sobre cero filas |
| 0.ESCALA (c) | Ninguna pantalla lee el error de la analítica: un 500 se ve como «0 clientes» | Lo que pasó el 04-10 |
| AISLA-5 · AISLA-8 | Test del `timingSafeEqual` · el resto de AISLA-8 | Auditoría §3.1 |
| — | `.mcp.json` en solo lectura · `.gitignore` del AIOS · §8.2 (`?? 150`) · §17.1b | Auditoría y consolidado §9 P1 |
| N17 | El README del AIOS promete un «olvidé mi contraseña» que no existe | Docs |

---

## 6. Gestos del dueño (no son código; nadie más puede hacerlos)

### 6.1 Hoy (cinco minutos cada uno)

1. ~~Pegar la 00069~~ — **aplicada el 2026-10-11.** La consulta (c) confirmó que **la 00030 no corrió**: 18 tablas
   conservan el DEFAULT puente a Sushi Service. Aplicarla pide antes barrer los INSERT sin `tenant_id` (`ESTADO.md` §3, ítem 9).
2. **Mirar que los registros (sign-ups) del Supabase del AIOS estén apagados.** Si están prendidos, cualquiera con la anon key
   entra al AIOS. (N2)
3. **Confirmar `ZERNIO_API_KEY` y `ZERNIO_WEBHOOK_SECRET`** vigentes en los dos Vercel.
4. **Mirar en n8n que esté apagado** (permite apagar el VPS).
5. **Correr las dos consultas de solo lectura** que alimentan las campañas: duplicados de `campaign_messages` y el conteo D-8.b.
6. **Mirar en los logs de Vercel del producto (`cada1`) del 5 y el 6 de octubre por qué fallaron los envíos de
   Planeta Wings** (`clubplanetawingsenvigado`: 10 reactivaciones y 1 cumpleaños, ~15:00 y ~13:00 Bogotá). Buscar
   `[WhatsApp] FALLO envío Zernio template=… status=… msg="…"`. En la base solo quedó «Twilio no configurado o error
   de envío», que es el texto fijo de antes de la fase 0.bis y no dice nada (es una marca Zernio). Si la causa sigue
   viva (p. ej. una plantilla sin aprobar), con la fase 0 desplegada esos 11 clientes reciben hasta 3 intentos más y
   se callan; conviene arreglarla antes.

### 6.2 Por marca, cuando puedas (detalle en `ESTADO.md` §3)

| Ítem | Qué |
|---|---|
| 0.CUMPLE | Crear «Cumpleaños — dos días antes» en cada marca (§3.4) |
| 0.DOMI | Encender «Domicilios por WhatsApp» de Planeta Wings en el AIOS · reiniciar o subir de Nano a Micro el Supabase del AIOS |
| 0.AUTOCHAT | La prueba real: José escribe un pedido en el auto-chat |
| 0.SUSHI | Verificación del negocio en Meta · alta en el AIOS · variables de Zernio · plantilla del Golden Bullet · tandas ≤ 250/día |
| 0.GB | Encender el flag · textos y plantilla · correr `line-health?dry=1` · decidir de qué marca es la base de 25.000 |
| 0.ALFA | Antes de la sede 2 de cualquier marca: «grupo» en el AIOS, subdominio por sede, sede o «rota» a cada mesero, celulares autorizados por sede, cupo real |
| 0.IOTA | Estrenar Zernio de verdad: secreto, nombre del header de la firma, Team, prueba a tu celular, cupo 250, plantillas de evento |
| 0.AIOS · 0.bis | Variables del Vercel del AIOS · rehacer Tepuy como una marca con dos sedes |
| 0.quinquies | Confirmar la 00009 del Supabase del AIOS |
| 0. | `AIOS_ADMIN_PROVISION_SECRET` igual en los dos Vercel |
| 1.bis · 2 | Mirar `/dashboard/marca` en un celular · smoke test con Sushi Service |
| 3 | Asignar sede a los meseros o marcarlos rotativos (si no, no salen en ningún escáner) |
| 5 | `owner_email` vacío en las 5 marcas |
| 9 | Aplicar la 00030 en ventana tranquila, si no corrió |
| 0.BETA | Verificar la coordenada con decimales en «Mis sedes» |
| §4 de `ESTADO.md` | Ver la API de Conversiones de Meta funcionar una vez · borrar ramas viejas y el stash · borrar el Supabase de Sushi Fun |

---

## 7. Lo que viene después (olas P3, P4, P6, P7, P8)

Detalle completo en `docs/ESTADO-CONSOLIDADO-2026-10-04.md` §9.

| Ola | Qué | Espera |
|---|---|---|
| **P3 · Ver y avisar** | Resumen diario al dueño · corridas de cron por marca · status callback de Twilio · tracking de errores · bitácora · aviso de saldo bajo · gasto por marca (OpenAI, Zernio) | D1, D2, D3 |
| **P4 · El alta sin cuello humano** | De 14 acciones manuales a las menos posibles · `owner_email` obligatorio · «olvidé mi contraseña» · roles en el AIOS · cobro con pasarela | D6, D7 |
| **P6 · Escala técnica** | Crons con el patrón de la cola · índices anti-duplicado · opt-out en lote · caché de host · probar con 1.000 marcas sintéticas | Antes de ~100 marcas |
| **P7 · Proceso** | Staging · registro real de migraciones · tests del AIOS · podar `ESTADO.md` (618 líneas; límite 150) y `CLAUDE.md` | — |
| **P8 · Catálogo** | Multi-sede por dentro · Black · tier máximo · push · logo y paleta en el alta · Google Contactos · franquicias · un celular por sede | C9, C10, D5 |

Y los 16 documentos que se contradicen o mienten: consolidado §8. A esos se suma uno del 08-10: el spec del ciclo decía
que el cron corre a las 10:00 de Bogotá (corre a las 15:00); ya está corregido.

---

## 8. Las decisiones: tomadas y abiertas

> **2026-10-11:** el dueño decidió los bloques A y B y parte del C, con los datos de producción del mismo día (spec del
> ciclo §14). ✅ = decidida, lista para construir. 👀 = gesto tuyo que no frena nada. ⏳ = abierta, no frena lo que sigue.
> Regla nueva (dueño, 11-10): lo técnico lo decide el comandante y avisa; al dueño solo se le pregunta lo que es suyo.

### A. Campañas

| # | Decisión | Estado |
|---|---|---|
| A1 | Las 14 decisiones base del ciclo (spec §9, 1–14) **más el motor de piezas**: cada comunicación es una pieza registrada para que cumpleaños del restaurante, eventos del momento, rifas y activaciones se agreguen sin rediseñar | ✅ |
| A2 | Máximo 3 mensajes de marketing al mes y 7 días entre cada uno | ✅ |
| A3 | El aviso «tu premio vence» sale por WhatsApp y solo para el regalo fuerte. Cada mensaje guarda su canal (hoy solo WhatsApp) | ✅ |
| A4 | **Ritmo personal** para clientes con 3 o más días con visita; **ritmo de la marca** calculado con sus datos para los nuevos. Cuatro ritmos validados: cafetería 7·14·26·42·58 · casual 10·17·29·45·61 · restaurante 14·28·42·60·80 · ocasiones 21·38·56·80·110 (`docs/features/ritmo-adaptativo.md`) | ✅ |
| A5 | Piloto de dos semanas en **Don Alirio** (no Sushi Service: su línea Twilio muere) | ✅ |
| A6 | Lo automático de «Para hoy» sale solo; «Hoy no» lo pospone | ✅ |
| A7 | «Premios» sale de Campañas y va a Recompensas | ✅ |
| A8 | Abrir el prototipo y decir qué sobra | 👀 no frena la fase 1 |
| A9 | Cumpleaños del restaurante y datos curiosos: piezas tipo evento | ✅ |
| A10 | Fechas especiales, ruleta, sorteos e Instagram: después de las fases 1 y 2, sobre el mismo motor | ✅ |
| A11 | **Sin Wallet** de Google ni Apple, ni para avisos ni para la tarjeta. El diferencial es WhatsApp | ✅ |
| A12 | **La métrica principal es la segunda visita** (línea base 11-10: ~22 % en Sushi Service y Don Alirio) | ✅ |

### B. Plantillas

| # | Decisión | Estado |
|---|---|---|
| B1 | Bajar de 13 a 8 aprobaciones de Meta por marca | ✅ |
| B2 | Probar la categoría UTILITY en bienvenida, puntos, recordatorios y «Regalo que vence», en **Sushi Fun** | ✅ |
| B3 | «Nivel desbloqueado» y «Recordatorio de premio» como plantillas propias. **Ojo:** P1-a encontró cuatro punteros fuera del catálogo, no dos; la sesión de plantillas los cubre todos | ✅ |
| B4 | Plantillas puntuales en una biblioteca reutilizable, en pestaña aparte dentro de Plantillas | ✅ |
| B5 | Las marcas Zernio crean plantillas libres desde el panel | ✅ |
| B6 | Las plantillas nuevas juntas, un solo viaje a Meta por marca | ✅ |
| B7 | El AIOS deja de crear plantillas y se las pide al producto | ✅ |

### C. Recompensas, tarjeta, reseñas, referidos

| # | Decisión o pregunta | Estado |
|---|---|---|
| C1 | Recompensas absorbe los premios que hoy están en Ajustes; puntos y Black, después | ✅ |
| C2 | «Temporal» es la ventana de reclamo que ya existe | ✅ |
| C3 | Los tres tipos de premio no se unifican todavía; las invitaciones eligen del catálogo | ✅ |
| C4 | «10 visitas»: ¿llenar los 10 sellos o llegar a Black? ¿Qué cuentan las estrellas y dónde se ven? ¿El 10 es igual para todas las marcas? (dato: en Don Alirio hay clientes con 27 visitas) | ⏳ |
| C5 | La elección de premio o caja misteriosa pasa a la tarjeta roja cuando se elimine la pantalla posterior | ✅ |
| C6 | Reseñas: interruptor explícito, sin paso 2 cuando no hay premio, premio al tocar el enlace, uno por cliente de por vida, por marca | ✅ |
| C7 | Referidos: ¿gana el que refiere, el referido o ambos? ¿Premio del catálogo o puntos? ¿Al registrarse o cuando el mesero valida la primera visita? | ⏳ |
| C8 | Los «pop-ups» son WhatsApp con botones (sin Wallet, A11) | ✅ |
| C9 | Black: ¿por visitas o por puntos? ¿Se pierde? ¿Hay algo encima? (deuda 17.b) | ⏳ |
| C10 | ¿Qué pasa al superar el último nivel de premios? | ⏳ |

### D. Operación y negocio

| # | Pregunta | Estado |
|---|---|---|
| D1 | El aviso diario de salud: ¿por qué canal y a quién? (propuesta: WhatsApp, solo al dueño) | ⏳ |
| D2 | Registro de errores: ¿Sentry (cuesta) o los logs de Vercel? | ⏳ |
| D3 | Zernio: ¿cuenta compartida con el otro proyecto o dedicada? | ⏳ |
| D4 | Consentimiento: ¿el CSV importado deja de contar como aceptación? ¿El domicilio sí cuenta? (propuesta: sí y sí) | ⏳ |
| D5 | Multi-sede: histórico sin sede (0.DELTA), tope de la caja por sede (0.GAMMA), un celular por sede (0.THETA), reseñas por sede (F10), teléfono del aviso de domicilios (D9) | ⏳ |
| D6 | Cobro: corte por mora, pasarela (Wompi) y precio | ⏳ |
| D7 | AIOS: ¿segundo operador, altas en lote, autorregistro? | ⏳ |
| D8 | Menores: texto de 18.c · qué muestra un subdominio sin marca (propuesta: página neutra) · hora del recordatorio · «Sushi Service Barra» · Frangal sin WhatsApp | ⏳ |
| D9 | El orden de trabajo de §1 | ✅ (el dueño lo sigue) |
