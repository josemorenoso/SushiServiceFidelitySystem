# RUNBOOK DE DEPLOY — pasos exactos, en orden

> **Para:** el despliegue del 2026-09-05 (multi-sede F1–F7 + §25 F2 + fix de db-errors).
> **Regla de oro:** los pasos van EN ORDEN. Los pasos 3 y 4 invertidos dejan a **todos los meseros
> con 403**. Si un paso falla, PARA y lee "Si algo sale mal" al final — no improvises hacia adelante.
> Todo lo de este runbook está verificado contra el código del repo, no de memoria.

---

## Paso 0 — Vercel Pro ANTES de pushear

`vercel.json` declara 5 crons, y **dos de ellos son `*/15 * * * *`**:

| Cron | Horario |
|---|---|
| `/api/cron/birthday` | `0 13 * * *` |
| `/api/cron/reactivation` | `0 15 * * *` |
| `/api/cron/reward-reminder` | `0 16 * * *` |
| `/api/cron/calendar-dispatch` | **`*/15 * * * *`** |
| `/api/cron/queue-drain` | **`*/15 * * * *`** |

Las cadencias sub-diarias necesitan plan de pago. **Compra Pro antes del push.** Si pusheas en Hobby,
el build falla y no despliega nada.

---

## Paso 1 — Variables de entorno en Vercel (producción)

### 1.a — `CRON_SECRET` es CRÍTICA (verificado)

Los 5 crons importan `validateCronSecret` de `src/lib/validators/cron.ts`, que exige el header
`Authorization: Bearer ${CRON_SECRET}`. Vercel envía ese header **solo si la variable `CRON_SECRET`
existe en el entorno**. Sin ella, los 5 crons responden **401 y fallan en silencio**: no hay
cumpleaños, ni reactivación, ni recordatorios, ni calendario, ni goteo de la cola. El sistema se ve
"vivo" pero no manda nada.

→ **Confirma que `CRON_SECRET` existe en Production antes de desplegar.**

### 1.b — `OPENAI_API_KEY` es NUEVA (la trae §25 Fase 2)

Se lee en un solo sitio, server-side: [src/lib/openai/client.ts:41](src/lib/openai/client.ts#L41).
Sin ella los domicilios no se parsean. **Créala ahora**, antes de apagar el VPS.

### 1.c — El resto (deben existir ya; confírmalas de paso)

`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` ·
`STAFF_JWT_SECRET` · `STAFF_QR_JWT_SECRET` · `WEBHOOK_DELIVERY_SECRET` · `TWILIO_ACCOUNT_SID` ·
`TWILIO_AUTH_TOKEN` · `TWILIO_WHATSAPP_NUMBER` · `ZERNIO_API_KEY` · `ZERNIO_WEBHOOK_SECRET` ·
`DELIVERY_PHONE_NUMBER` · `USD_COP_RATE` · `RESTAURANT_WHATSAPP_LINK` · `N8N_GOOGLE_CONTACTS_WEBHOOK_URL`
· las `NEXT_PUBLIC_BRAND_*` · `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL` · `NEXT_PUBLIC_STAFF_ROLE_LABEL` ·
`ZERNIO_TEMPLATE_LANGUAGE` · `ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL` · `ZERNIO_TEMPLATE_SAMPLE_VIDEO_URL`

---

## Paso 2 — Chequeo previo a la 00044 (esto puede ABORTAR la migración)

La 00044 tiene un bloque de guarda que **aborta con 23505 si hay `device_fingerprint` repetidos dentro
de un mismo tenant** — y aborta a propósito, sin deduplicar, porque borrar una fila de `staff_devices`
saca del trabajo al celular de alguien y eso lo decides tú, no la migración.

**Corre esto en el SQL Editor de Supabase ANTES de la 00044:**

```sql
SELECT tenant_id, device_fingerprint, count(*) AS filas
  FROM staff_devices
 GROUP BY tenant_id, device_fingerprint
HAVING count(*) > 1;
```

- **0 filas** → adelante, la 00044 va a pasar.
- **Alguna fila** → decide cuál dispositivo se queda y borra el otro **a mano** antes de seguir. No
  automatices esto.

Las otras dos guardas de la 00044 exigen la **00041** y la **00043**, que ya están aplicadas en
producción — no deberían saltar.

---

## Paso 3 — Migraciones, en este orden y ANTES del código

En el SQL Editor de Supabase, **el archivo completo, de una sola vez, uno después del otro**:

1. `supabase/migrations/00044_meseros_por_sede.sql`
2. `supabase/migrations/00045_permisos_por_sede.sql`

La 00045 trae al final su propio bloque de autoverificación: si algo quedó a medias, aborta diciendo
qué falta. Si las dos terminan sin error, están bien.

> **Por qué el orden importa tanto:** el código de F4 hace `SELECT ... location_id` sobre
> `staff_users`. Si despliegas el código antes de la 00044, esa columna no existe, PostgREST devuelve
> `42703` y **el check-in responde 403 a TODOS los meseros**. Migraciones primero. Siempre.

---

## Paso 4 — Push del código

```bash
cd "c:/Users/luisr/Downloads/Software Cada1 - copia"
git remote -v          # DEBE decir origin -> SushiServiceFidelitySystem
git status --porcelain # debe estar limpio
git log --oneline -5   # revisa que esté lo que esperas
git push origin main
```

⚠️ Hay tres remotos (`origin`, `fun`, `donalirio`). **Solo `origin` despliega.** Ya pasó una vez que
22 commits acabaron en el repo equivocado: verifica antes de pushear.

---

## Paso 5 — Smoke test en producción (con Sushi Service real)

En este orden, y **desde un celular**, que es como se usa de verdad:

1. **Check-in de cliente**: escanear QR → registrar un número → confirmar que suma visita.
2. **Mesero**: login → escanear el QR de un cliente → confirmar que la visita queda atribuida.
   *(Es lo más sensible del deploy: si la 00044 no entró bien, aquí sale el 403.)*
3. **Tarjeta**: abrir `/tarjeta` de un cliente y ver puntos y próximo premio.
4. **Panel**: entrar al dashboard, ver métricas, y **probar el selector de sede nuevo** (F7).
5. **Premio**: generar y redimir uno.
6. **Domicilio**: mandar un "cuadro" de prueba desde un número de `authorized_numbers` y confirmar que
   el pedido se crea **por el producto**, no por n8n.

---

## Paso 6 — Verificar los crons (no lo saltes)

Después del primer deploy, en el panel de Vercel → pestaña **Crons**: confirma que cada uno corrió y
devolvió **200**. Un **401** significa que `CRON_SECRET` no está bien puesta (Paso 1.a).

Con el CLI (si lo instalas con `npm i -g vercel`) también puedes dispararlos a mano para no esperar:

```bash
vercel crons ls
vercel crons run /api/cron/queue-drain
```

---

## Paso 7 — Cutover de n8n (SOLO si los pasos 5 y 6 salieron bien)

⚠️ **Un cron en Vercel y su Schedule Trigger en n8n activos a la vez = doble disparo** (mensajes
duplicados a clientes reales).

1. Apaga los **5 Schedule Triggers** de n8n que corresponden a los 5 crons de arriba.
2. Vuelve a probar un domicilio de punta a punta.
3. **Solo entonces** apaga el VPS. `domicilios_whatsapp_v4.json` es lo único que lo mantenía vivo.

---

## Si algo sale mal

- **Los meseros reciben 403** → la 00044 no entró. Aplícala; el código ya desplegado empieza a
  funcionar solo, sin re-deploy.
- **Los crons dan 401** → falta `CRON_SECRET` en Production. Ponla y redespliega.
- **El build falla por los crons** → Vercel Pro no está activo (Paso 0).
- **Los domicilios no parsean** → falta `OPENAI_API_KEY`.
- **Hay que volver atrás en el código** → en Vercel, "Promote to Production" sobre el deploy anterior.
  Es lo más rápido y no toca la base.
- **Las migraciones NO se revierten.** Son aditivas (columnas nuevas nullables, tabla nueva, policies).
  Si el código vuelve atrás, la base con 00044/00045 aplicadas lo soporta igual: el código viejo
  simplemente no usa las columnas nuevas. **No intentes desaplicarlas.**
- La rama `backup/pre-f7-merge` es el estado de `main` justo antes del merge de F7, por si hiciera
  falta reconstruir algo. No la borres hasta que el deploy esté estable.

---

## Después del deploy (no el mismo día)

1. Aplicar la **00030** en ventana tranquila (cierra el DEFAULT puente que manda a Sushi Service todo
   INSERT sin `tenant_id`).
2. Los pendientes de producto que siguen abiertos están en [docs/ESTADO.md](ESTADO.md) §4 — el más
   grande es **§19 (escáner de meseros)**, que además choca con D11 y necesita decisión tuya.
