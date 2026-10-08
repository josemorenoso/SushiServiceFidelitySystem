# PENDIENTES — todo lo que falta, en un solo lugar

> **Última actualización:** 2026-10-08 (Opus 5.5, solo docs). **Es la puerta de entrada a lo que falta.** Si algo
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
| `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md` | **El diseño de las campañas nuevas** (el ciclo). Tres pasadas: la original, la revisión del dueño (§12) y la verificación del 08-10 (§13) | Vigente, sin código |
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
| 1 | **Gestos de hoy** (§6.1): pegar la 00069, mirar los registros del Supabase del AIOS | Nada: solo hacerlo | — |
| 2 | **Campañas, fase 0: parar la sangría.** Un envío fallido deja de bloquear 30 o 360 días · la insistente deja de repetirse cada mes · el texto de Campañas deja de mentir · una sola escala de días · una consulta de solo lectura que mide el daño real | Nada | no |
| 3 | **Plantillas, pasos 1 a 3** (§3): un solo libro de plantillas, cerrar el hueco catálogo ↔ código, una sola pantalla. **Y en la misma sesión, las cuatro plantillas nuevas juntas** (§3.2) para que cada marca pase por Meta una sola vez | B1–B7 (§8) | 0 o 1 |
| 4 | **Campañas, fase 1: el motor del ciclo** (dos sesiones: base y cron) | A1–A6 (§8) | 1 |
| 5 | **Recompensas en un solo lugar** (S-1) | C1–C3 | 0 o 1 |
| 6 | **Campañas, fase 2: la pantalla** (dos o tres sesiones) | A7–A8, y mirar el prototipo | no |
| 7 | **Optimizar: los arreglos chicos** (§5), repartidos en una o dos sesiones | Solo el texto de 18.c | no |
| 8 | **La tarjeta, las reseñas y los referidos** (§4.2) | C4–C8 | 1–2 |
| 9 | Campañas, fase 3: afinar con datos (un mes después de la fase 1) | Leer el reporte | no |
| 10 | Lo demás, por olas (§7) | §8, bloque D | varias |

**2 y 3 pueden ir en paralelo** (no comparten archivos). **3 y 4 se cruzan** en `template-catalog.ts` y `template-texts.ts`:
por eso la plantilla nueva del ciclo («Regalo que vence») entra en la sesión 3, junto con las otras tres, y la 4 ya la
encuentra hecha. **5 y 6 se cruzan** en `campaigns/page.tsx` (la pestaña «Premios»): 5 va primero.

---

## 2. Campañas: el ciclo de recuperación

**Estado:** diseñado y revisado dos veces, verificado contra el código el 08-10. **Cero código.** Lo que hoy corre en
producción es el sistema viejo, con sus fallas (N3, N4, N15).

### 2.1 Qué hace el diseño, en cinco líneas

1. Cada cliente recorre un ciclo desde su última visita: **cinco toques** con huecos crecientes («Le recordamos», «Le
   regalamos algo», «Le mostramos lo otro», «Rescate», «Despedida»). Los días salen de **una pregunta**: ¿cada cuánto
   vuelve un cliente típico?
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
| **0 · Parar la sangría** | N3 (un fallo de envío ya no calla 30 días la reactivación ni 360 el cumpleaños) · N4 (la insistente máximo una vez por ciclo) · N15 (el texto de Campañas dice la verdad: cumpleaños «dos días antes», «13:00 Bogotá») · una sola escala de días para burbujas, tira y cron · consulta de solo lectura en `SQL-PARA-CORRER/ciclo-fase-0/` | ⬜ Prompt listo. **Se puede empezar ya** |
| **1 · El motor** | Migración (hoy el script dice **00070**; el número se saca al construir) · los dos triggers · el backfill sin ráfaga · `cycle-engine.ts` con los cuatro ritmos · el cron que decide y encola · el drenador que otorga al enviar · las correcciones H1–H7 · tests | ⬜ Espera A1–A6 |
| **2 · La pantalla** | Primer uso · «Para hoy» · seis cajas · vista por fecha con proyección y fechas especiales · mandar un regalo en tres campos · evento con texto sugerido · el calendario redirige · mini-ciclo en el panel · se retiran las burbujas y las cuatro tarjetas | ⬜ Espera A7–A8 y el prompt (se escribe cuando mires el prototipo) |
| **3 · Afinar** | El calibrador que sugiere el ritmo · regalos pequeños que rotan · reporte «con mensaje contra sin mensaje» por toque · texto del evento con el LLM | ⬜ Un mes después de la fase 1 |
| **4 · Futuro** | Fechas especiales completas por rubro · ruleta · sorteos y rifas · cliente del mes · Instagram · «cumpleaños del restaurante» y «datos curiosos» | ⬜ Espera A9–A10 |

**Lo que tienes que hacer tú cuando llegue la fase 1:** aplicar la migración en Supabase **antes** del deploy (al revés,
todos los envíos fallan en silencio) · contestar el ritmo de cada marca · crear «Regalo que vence» en cada marca (o dejar
que salga con la insistente) · elegir el regalo pequeño y el fuerte de cada marca (o ninguno).

### 2.5 Lo que el diseño mide para saber si funciona

Retorno por toque a 14 días, con mensaje contra sin mensaje · segunda visita (ciclo 1 que abre el ciclo 2 en 60 días) ·
retorno antes de dormirse · reactivados desde dormido · opt-outs por cada 1.000 mensajes (meta < 5) · regalos otorgados,
redimidos y vencidos por etapa (conteos, nunca pesos) · cuántos envíos manuales salieron por «mandar un regalo» y cuántos
por «mensaje libre». Detalle: spec §11.

---

## 3. Plantillas

**Estado:** diagnóstico cerrado el 11-09 (`docs/PENDIENTES-PLANTILLAS.md`), plan **sin decidir**. Hecho desde entonces: el
nombre editable de la plantilla (`8cf5ed4`), «Cumpleaños — dos días antes» en el catálogo (desplegado el 04-10).

### 3.1 El plan, en orden (de `PENDIENTES-PLANTILLAS.md` §3)

| # | Qué | Quita | Estado |
|---|---|---|---|
| 1 | **Un solo libro de plantillas:** el AIOS deja de crearlas y le pide al producto que las cree. Muere la copia de textos, el sondeo manual, el paso 5 del AIOS y el estado «activo sin texto» | Dos catálogos que se ignoran (1.1, 1.4) | ⬜ · decisión B7 |
| 1.bis | **Adoptar lo que ya existe en la WABA** (el punto 1 del prompt del 12-09): leer la categoría real, decir «ya existe» en vez de «reintenta más tarde» | El 400 de Planeta Wings | ⬜ · prompt listo |
| 2 | **Cerrar el hueco catálogo ↔ código:** `tier_unlocked` y `reward_reminder` entran al catálogo. Hoy, en Zernio, **subir de nivel es silencio total** y el recordatorio de premio no sale | 1.2 | ⬜ · decisión B3 |
| 3 | **Una sola pantalla «Mensajes» para Twilio y Zernio:** un renglón por mensaje, un botón, el puntero se asigna solo al aprobar. Desaparecen Ajustes › Plantillas y el formulario suelto de Twilio | 1.3, 1.7 | ⬜ |
| 4 | **Reducir de 13 a 8 aprobaciones por marca**, con la variación en variables | 1.5 | ⬜ · decisión B1 |
| 5 | **Probar UTILITY** en bienvenida, puntos, premios y recordatorio (y en «Regalo que vence»), en una marca | 1.6 | ⬜ · decisión B2 |
| 6 | **Rechazos y pausas con salida:** el motivo traducido a una acción y el editor abierto con el texto rechazado | 1.7 | ⬜ |
| 7 | **Mostrar lo que no salió:** fallos por plantilla en Mensajes; el escáner le dice al mesero «este cliente no recibió WhatsApp» | 1.8 | ⬜ |
| 8 | Fundir los cuatro docs de plantillas en uno | 1.9 | ⬜ |

### 3.2 Una sola ronda de Meta por marca (propuesta nueva, 08-10)

Hoy hay **cuatro plantillas nuevas** esperando, cada una por su lado: «Cumpleaños — dos días antes» (ya en el catálogo),
«Regalo que vence» (el ciclo), «Nivel desbloqueado» y «Recordatorio de premio» (paso 2). Si entran al catálogo en la misma
sesión, cada marca hace **un solo viaje** a Meta (un botón, 24-72 h) en vez de cuatro. Es la decisión **B6**.

### 3.3 Tu Tarea 2 (S-2) y los defectos sueltos

| ID | Qué | Estado |
|---|---|---|
| S-2.1 | Separar las plantillas automáticas de las que creas para una campaña puntual. En Twilio la lista no marca nada | 🟡 · decisión B4 |
| S-2.2 | Las automáticas «no se tocan, se usa la misma, se modifica si hace falta» | 🟡 (Zernio sí; Twilio no edita fuera del catálogo) |
| S-2.3 | Crear plantillas libres. Twilio sí puede; **Zernio no tiene cómo desde el panel** | ⬜ · decisión B5 |
| S-2.4 | **Restricción tuya: no rediseñar cómo se ven** («me encanta cómo se ven ahora») | regla |
| N5 | Un administrador de sede puede editar, someter o adoptar plantillas de toda la marca | ⬜ micro |
| N9 | Una marca Zernio del AIOS no deja rastro de ningún rechazo ni pausa de sus 13 plantillas | ⬜ (lo cierra el paso 1) |
| N16 | La pantalla Mensajes llama a la WABA de Zernio en cada carga, sin caché | ⬜ micro |
| N23 | Campañas → Manuales no pagina las plantillas de Twilio: pasadas 100, desaparecen. Y el envío manual solo rellena nombre, puntos y próximo premio | ⬜ micro |
| OPER-4 | `PUT /api/dashboard/settings` acepta cualquier clave: un puntero de plantilla se puede pisar sin pasar por `promoteVersion()`. Falta la lista cerrada | ⬜ micro |
| OPER-6 | Test de paridad entre el catálogo y las claves que el código consume | ⬜ |

### 3.4 Plantillas que cada marca tiene que crear hoy (gestos, no código)

- **«Cumpleaños — dos días antes»**: Planeta Wings (Zernio: Enviar a Meta) · Sushi Service, Sushi Fun, Don Alirio, Frangal,
  demo-ventas (Twilio: Crear) · Tepuy ya la trae. Mientras no esté aprobada, cada marca saluda el día mismo. (`ESTADO.md` 0.CUMPLE)
- **Plantillas de evento con imagen** en las marcas Twilio: el cuerpo corregido (22 palabras) está en `docs/PLANTILLAS.md`
  § Plantilla 12. Al aprobar, pegar el `HX…` en `admin_settings.event_template_*_sid`. (`ESTADO.md` 0.IOTA punto 6)
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
| N3 · N4 · N15 | Un fallo de envío calla 30/360 días · la insistente sin tope · el texto de Campañas miente | **Son la fase 0 del ciclo** (§2.4) |
| N6 | Los botones sí/no del webhook de Zernio esperan 10 s antes de contestar | El mismo riesgo de apagón que se cerró en ESCALA-3 |
| N7 | Tres búsquedas sin paginar; el tope mensual, ante un error, **no se aplica** y no deja log | Fatiga y cupo |
| N8 | Errores tragados en `getActiveTenants()` y `getTenantByDomain()`; escrituras posteriores al envío sin leer `error` | Un fallo de base se ve como «nada que hacer» |
| N13 | El PIN del supervisor no tiene límite de intentos | Seguridad |
| N18 | Un test de la analítica contra el Postgres real (el 500 del 04-10 lo habría cazado) + CI (PROC-1) | Cada push a `main` despliega |
| SEG-2 · SEG-3 | La carrera de dos `resolve` simultáneos · `PUT tenant-config` abierto a un administrador de sede | Prompt listo: `docs/prompts/2026-10-04-seg2-resolve-y-tenant-config.md` |
| OPER-4 | Lista cerrada de claves en `PUT settings` | Ver §3.3 |
| 0.ETA | La importación de CSV cuenta como importados los que la base rechazó | Con 2+ sedes reporta éxito sobre cero filas |
| 0.ESCALA (c) | Ninguna pantalla lee el error de la analítica: un 500 se ve como «0 clientes» | Lo que pasó el 04-10 |
| AISLA-5 · AISLA-8 | Test del `timingSafeEqual` · el resto de AISLA-8 | Auditoría §3.1 |
| — | `.mcp.json` en solo lectura · `.gitignore` del AIOS · §8.2 (`?? 150`) · §17.1b | Auditoría y consolidado §9 P1 |
| N17 | El README del AIOS promete un «olvidé mi contraseña» que no existe | Docs |

---

## 6. Gestos del dueño (no son código; nadie más puede hacerlos)

### 6.1 Hoy (cinco minutos cada uno)

1. **Pegar la 00069 entera** en el SQL Editor del Supabase del **producto**. Cierra dos agujeros entre marcas que están
   vivos (AISLA-2, OPUS-4). Después, la consulta (c) del prompt de la ola 0: dice si la 00030 y la 00015 corrieron. (`ESTADO.md` 0.SEGURIDAD)
2. **Mirar que los registros (sign-ups) del Supabase del AIOS estén apagados.** Si están prendidos, cualquiera con la anon key
   entra al AIOS. (N2)
3. **Confirmar `ZERNIO_API_KEY` y `ZERNIO_WEBHOOK_SECRET`** vigentes en los dos Vercel.
4. **Mirar en n8n que esté apagado** (permite apagar el VPS).
5. **Correr las dos consultas de solo lectura** que alimentan las campañas: duplicados de `campaign_messages` y el conteo D-8.b.

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

## 8. Todas las preguntas abiertas, con su valor por defecto

> **Si no contestas una, se construye con el default.** Basta «sí a los defaults salvo A5 y C4», por ejemplo.
> Origen: spec del ciclo §9 (A1) · tercera pasada del 08-10 (A3–A6, B6) · consolidado §10.5 (Q1–Q13) y §7 · `ESTADO.md` §3 y §4.

### A. Campañas (bloquean la fase 1 y la 2)

> En el spec del ciclo §9 son las decisiones 1–14 (A1), 15 (A3), 16 (A4), 17 (A5), 18 (A7) y 19 (A6).

| # | Pregunta | Default |
|---|---|---|
| **A1** | ¿Apruebas los 14 defaults del spec §9? Ritmo por marca (mensual 12·24·38·56·80) · cuentan para las 6: manuales, eventos y ciclo, no cumpleaños ni recordatorio · el contador solo se reinicia con una visita · el domicilio reinicia · backfill hacia adelante, más de 90 días → dormido sin ráfaga · trimestral a dormidos (pequeño a los 90, fuerte a los 180, máximo 2) · cooldown de 180 días del regalo fuerte · eventos no van a dormidos salvo casilla · probar «Regalo que vence» como UTILITY · sin puntos extra por volver · grupo de control del 10 % (0 en marcas de menos de 200 clientes) · hora: cena 16:30 · «Le mostramos lo otro» solo con domicilio · Mensaje libre se quita si en un mes nadie lo usa | Sí a todos |
| **A2** | ¿Se mantienen «máximo 3 mensajes al mes y 7 días entre cada uno»? | Sí |
| **A3** | ¿El recordatorio de vencimiento solo para el regalo fuerte? (H2: con los dos, el tope de 3 se rompe) | Sí |
| **A4** | ¿Ritmos corregidos? Semanal 7·14·26·42·58 y quincenal 10·17·29·45·61 (H1) | Sí |
| **A5** | ¿El ciclo se enciende marca por marca, con una piloto dos semanas, o en las 25 a la vez? ¿Cuál es la piloto? | Piloto: Sushi Service |
| **A6** | Lo automático en «Para hoy»: ¿sale solo si no tocas nada, o nada sale sin tu OK? | Sale solo; «Hoy no» lo pospone |
| **A7** | ¿La pestaña «Premios» sale de Campañas y va a Recompensas (tu Tarea 1)? Campañas quedaría con Ciclo e Historial | Sí |
| **A8** | Abrir el prototipo v2 y decir qué sobra o qué falta | (gesto) |
| **A9** | «Cumpleaños del restaurante» y «datos curiosos»: ¿eventos del calendario o toques del ciclo? | Eventos |
| **A10** | ¿Fechas especiales completas, ruleta, sorteos e Instagram quedan para la fase 4? | Sí |

### B. Plantillas (bloquean la sesión 3)

| # | Pregunta | Default |
|---|---|---|
| **B1** | ¿Reducir de 13 a 8 aprobaciones por marca, poniendo la variación en variables? | Sí, ahora que ninguna marca Zernio ha mandado mensajes reales |
| **B2** | ¿Probar UTILITY en bienvenida, puntos, premios, recordatorio y «Regalo que vence»? ¿En qué marca? | Sí, en una marca Twilio |
| **B3** | «Nivel desbloqueado» y «Recordatorio de premio»: ¿plantillas propias o fundidas en «puntos sumados»? | Propias |
| **B4** | Plantillas puntuales: ¿biblioteca que se reutiliza o de un solo uso? ¿Separadas en pestañas dentro de Plantillas? | Biblioteca, en pestañas |
| **B5** | ¿Las marcas Zernio pueden crear plantillas libres desde el panel? ¿Qué variables además de nombre, puntos y próximo premio? | Sí; las mismas tres |
| **B6** | ¿Las cuatro plantillas nuevas entran juntas para que cada marca vaya a Meta una sola vez? (§3.2) | Sí |
| **B7** | ¿El AIOS deja de crear plantillas y se las pide al producto? (paso 1 del plan) | Sí |

### C. Recompensas, tarjeta, reseñas, referidos

| # | Pregunta | Default |
|---|---|---|
| **C1** | ¿Recompensas absorbe también lo de Ajustes (premio de la agresiva, de la reseña, puntos, Black) o solo la pestaña? | Los premios sí; puntos y Black después |
| **C2** | «Temporal»: ¿un premio con fechas propias (nuevo) o la ventana de reclamo de cada otorgamiento (existe)? | La ventana que existe |
| **C3** | ¿Se unifican los tres modelos de premio (catálogo, texto libre de invitaciones, niveles y caja)? ¿Qué se hace con `rewards`, en desuso? | No por ahora; las invitaciones eligen del catálogo |
| **C4** | «10 visitas»: ¿llenar los 10 sellos o llegar a Black? ¿Las estrellas cuentan tarjetas completadas o niveles? ¿Dónde se ven? ¿El 10 es igual para todas las marcas? | — (sin default) |
| **C5** | Sin la pantalla posterior: ¿la elección de premio o caja pasa a la roja, se entrega el seguro solo, o la resuelve el mesero? ¿El pop-up de reseña sale al escanear o al abrir la tarjeta? | Pasa a la roja |
| **C6** | Reseñas: ¿interruptor explícito? Sin premio, ¿se quita el paso 2? ¿Premio al tocar el enlace o cuando el mesero ve la reseña? ¿Uno de por vida o por periodo? ¿Por sede o por marca? | Interruptor; sin paso 2; al tocar; de por vida; por marca |
| **C7** | Referidos: ¿gana el que refiere, el referido o ambos? ¿Premio del catálogo o puntos? ¿Al registrarse el amigo o cuando el mesero valida su primera visita? ¿Mensaje propio o un toque del ciclo? | — (sin default) |
| **C8** | «Pop-ups de Google»: ¿Google Wallet, notificaciones del navegador o WhatsApp con botones? | WhatsApp con botones |
| **C9** | Black: ¿por visitas, puntos o ambos? ¿Qué es el beneficio permanente? ¿Se pierde? ¿Hay un nivel encima? (deuda 17.b) | — (sin default) |
| **C10** | ¿Qué pasa al superar el último nivel de premios? (§8.1) | — (sin default) |

### D. Operación y negocio

| # | Pregunta | Default |
|---|---|---|
| **D1** | El aviso diario de salud: ¿por qué canal (WhatsApp, correo, Telegram) y a quién (tú, o también cada restaurante)? Desbloquea casi toda la ola P3 | WhatsApp, solo a ti |
| **D2** | Errores: ¿Sentry (cuesta) o un log drain de Vercel? | — |
| **D3** | Zernio: ¿Team compartido con el otro proyecto o dedicado? | — |
| **D4** | Consentimiento (Ley 1581): ¿el «Importar CSV» deja de contar como consentimiento? ¿Un domicilio cuenta? ¿Qué pasa con los clientes que aceptaron antes de la casilla de Meta? | El CSV no consiente; el domicilio sí; los anteriores no se mandan a Meta |
| **D5** | Multi-sede: ¿el administrador de sede ve lo histórico sin sede (0.DELTA)? ¿El tope global de la caja pasa a ser por sede (0.GAMMA)? ¿Un celular por sede (0.THETA)? ¿Dos premios de reseña por cliente con varias sedes (F10)? ¿Qué teléfono responde el aviso automático de domicilios (D9)? | — |
| **D6** | Cobro: ¿política de corte por mora, pasarela (Wompi) y precio único? | — |
| **D7** | AIOS: ¿se suma pronto un segundo operador? ¿Alta en lote? ¿Autorregistro? | — |
| **D8** | Menores: el texto de 18.c · qué muestra un subdominio sin marca (hoy muestra Sushi Service) · la hora del recordatorio de premio (hoy 11:00 Bogotá) · qué es «Sushi Service Barra» · pasar Frangal a «Sin WhatsApp» | Página neutra; recordatorio a la hora de la marca |
| **D9** | ¿Confirmas el orden de trabajo de §1? | Sí |
