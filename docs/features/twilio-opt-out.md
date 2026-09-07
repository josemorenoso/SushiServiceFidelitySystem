# Twilio Opt-Out — Configuración de Keywords y Replicación Rápida

> **Feature:** Configuración de opt-out/in/help keywords en español para el Messaging Service de Twilio.
> **Última actualización:** 2026-09-06

---

## Contexto

El número de WhatsApp de Twilio (`whatsapp:+573243374320`) envía mensajes automatizados a los clientes. Twilio tiene un sistema de **opt-out automático** que bloquea números cuando el cliente responde con ciertas palabras clave. Por defecto solo vienen en inglés (`STOP`, `START`, `HELP`). Este feature agrega keywords en español incluyendo **`SALIR`** que es la palabra usada en todas las plantillas del sistema.

---

## Estado actual (producción)

**Messaging Service:** `SushiService-Fidelity` (`MG7948d2ca392da76f17ea59b9974dffc2`)

| Sección | Keywords configurados |
|---------|----------------------|
| **Opt-out** | `cancel`, `cancelar`, `end`, `fuera`, `optout`, `quit`, `remova`, `sair`, `sal`, `sali`, `salir`, `stop`, `unsubscribirse` |
| **Opt-in** | `acepto`, `al`, `alt`, `alta`, `empezar`, `si`, `start`, `suscribirse`, `unstop`, `yes` |
| **Help** | `ayuda`, `help`, `info` |

> Nota: `sal`, `sali`, `sair`, `remova` son keywords que Twilio sugiere automáticamente por similitud con `salir`.

---

## Método 1: Consola Web (recomendado para primera vez)

1. Ir a [**Twilio Console → Messaging → Settings → Opt-Out Management**](https://console.twilio.com/us1/develop/sms/settings/opt-out-management)
2. Seleccionar el Messaging Service **`SushiService-Fidelity`**
3. En cada sección, agregar los keywords separados por comas:
   - **Opt-out:** `SALIR, BAJA, CANCELAR`
   - **Opt-in:** `ALTA, ACEPTO`
   - **Help:** `AYUDA, INFO`
4. Guardar cambios.

---

## Método 2: API REST (replicación rápida, reproducible)

Este método es útil para:
- Replicar la configuración en un nuevo clone/cliente.
- Automatizar el setup sin entrar a la consola web.
- Documentar exactamente qué se configuró.

### Prerrequisitos

- Credenciales en `.env.twilio`:
  ```bash
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_AUTH_TOKEN=...
  ```
- `Messaging Service SID` (ej: `MG7948d2ca392da76f17ea59b9974dffc2`)

### Script PowerShell

```powershell
# ─── Configuración ───
$TWILIO_ACCOUNT_SID = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
$TWILIO_AUTH_TOKEN = "TU_AUTH_TOKEN_AQUI"
$MESSAGING_SERVICE_SID = "MG7948d2ca392da76f17ea59b9974dffc2"  # SushiService-Fidelity

# ─── Auth Basic ───
$pair = "${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}"
$bytes = [System.Text.Encoding]::ASCII.GetBytes($pair)
$base64 = [System.Convert]::ToBase64String($bytes)
$headers = @{
    Authorization = "Basic $base64"
    "Content-Type" = "application/x-www-form-urlencoded"
}

# ─── Keywords ───
# Incluir TODOS los defaults de Twilio + los custom en español
$OPT_OUT = "STOP,STOPALL,UNSUBSCRIBE,CANCEL,END,QUIT,BAJA,CANCELAR,SALIR"
$OPT_IN  = "START,YES,UNSTOP,ALTA,ACEPTO"
$HELP    = "HELP,INFO,AYUDA"

# ─── Llamada API ───
$body = "OptOutKeywords=$OPT_OUT&OptInKeywords=$OPT_IN&HelpKeywords=$HELP"

$response = Invoke-WebRequest `
    -Uri "https://messaging.twilio.com/v1/Services/$MESSAGING_SERVICE_SID" `
    -Method POST `
    -Headers $headers `
    -Body $body `
    -UseBasicParsing

# ─── Verificar respuesta ───
if ($response.StatusCode -eq 200) {
    Write-Host "Opt-out keywords actualizados correctamente" -ForegroundColor Green
} else {
    Write-Host "Error: $($response.StatusCode)" -ForegroundColor Red
    Write-Host $response.Content
}
```

### Verificación

```powershell
# Ver que el service existe y tiene el webhook correcto
twilio api:messaging:v1:services:fetch --sid $MESSAGING_SERVICE_SID
```

> Nota: Twilio **no expone un endpoint público** para leer los keywords guardados. La única forma de verificar es entrar a la consola web o confiar en el HTTP 200 de la respuesta.

---

## Impacto del opt-out

Cuando un cliente responde cualquier keyword de opt-out (ej: `SALIR`):

1. Twilio bloquea automáticamente ese número — **en SMS**. En WhatsApp el Advanced Opt-Out no actúa: la keyword llega a `/api/webhook/twilio-incoming` y es NUESTRO código el que la registra (verificado en producción el 2026-09-06 con `CANCEL`, `CANCELAR`, `STOP` y `SALIR`).
2. Futuros envíos devuelven error **21610** (`Attempt to send to opted out recipient`).
3. El sistema loguea este error en `whatsapp.service.ts` con el código completo para diagnóstico.
4. El cliente puede reactivarse respondiendo cualquier keyword de opt-in (ej: `ALTA`, `START`).

### Manejo en el código

En `src/services/whatsapp.service.ts` el envío de WhatsApp atrapa el error 21610 y lo registra en `message_logs` con su código.

### Opt-out persistente (v1.8.0 — auditoría 12-Julio, tarea 8)

Antes, el webhook entrante detectaba las keywords de opt-out pero **no marcaba al cliente en la base de datos**, así que el sistema seguía intentando enviarle. Ahora el estado se persiste:

1. **Columna `customers.whatsapp_opt_out_at`** (migración `00021`). NULL = puede recibir.
2. **`src/app/api/webhook/twilio-incoming/route.ts`** — al recibir un keyword de opt-out (`SALIR`, `STOP`, `BAJA`, `CANCELAR`, `FUERA`…) llama a `setWhatsappOptOut(phone)` (marca `whatsapp_opt_out_at = now()` y `accepts_marketing = false`). Un keyword de opt-in (`ALTA`, `START`, `ACEPTO`…) llama a `clearWhatsappOptOut(phone)`.
3. **Verificación antes de enviar** — `sendTemplateMessage` consulta `isPhoneOptedOut(phone)` y, si está en opt-out, **omite el envío** (no malgasta el mensaje ni genera el error 21610) y lo registra en `message_logs` con `error_code = 'opted_out_local'`.

> Funciones en `src/services/customer.service.ts`: `setWhatsappOptOut`, `clearWhatsappOptOut`, `isPhoneOptedOut`. Todas best-effort **en el sentido de que no lanzan**, no en el de que se traguen el resultado: desde el 2026-09-06 las dos primeras devuelven `OptOutWriteResult` y el llamador sabe si escribió algo — ver «El log que mentía» más abajo. `isPhoneOptedOut` sigue devolviendo `false` ante error, para no bloquear envíos legítimos por un fallo transitorio.

---

## El log que mentía (2026-09-06)

Cuatro pruebas del dueño —`CANCEL`, `CANCELAR`, `STOP`, `SALIR`— dejaron esta línea en
los logs de producción:

```
[twilio-incoming] opt-out persistido para 3243416918 (keyword="CANCEL")
```

...y el panel siguió en cero. **Las dos cosas eran ciertas.** `setWhatsappOptOut()`
devolvía `void`, así que el webhook no tenía forma de distinguir estos dos desenlaces:

| Lo que pasó | Lo que veía el llamador |
|---|---|
| Se marcó un cliente | `error = null` |
| **No había a quién marcar** (cero filas) | `error = null` |

Un `UPDATE ... WHERE phone = $1 AND tenant_id = $2` que no encuentra a nadie es un
**éxito** para Postgres. No es un caso raro en multi-tenant: basta con que el número
le escriba a la línea de la marca A teniendo su ficha en la marca B, o con que el
cliente de prueba se haya borrado después.

### Cómo se arregló

`setWhatsappOptOut()` y `clearWhatsappOptOut()` devuelven ahora `OptOutWriteResult`
(`src/services/customer.service.ts`) y encadenan `.select('id')` —sin él supabase-js
manda `Prefer: return=minimal` y no hay nada que contar—. Tres desenlaces distinguibles:

| Resultado | Qué significa | Qué loguea el webhook |
|---|---|---|
| `{ ok: false }` | La base falló. **El cliente sigue recibiendo.** | `opt-out NO persistido …: <motivo>` |
| `{ ok: true, matched: 0 }` | Ese teléfono no tiene ficha en ESTE tenant. | `opt-out SIN FICHA: … no aparecerá en el panel` |
| `{ ok: true, matched: n }` | n filas marcadas. Esto sí sale en el panel. | `opt-out persistido … filas=n` |

**Si el panel está vacío, el log de Vercel ya dice por qué**, y dice de qué marca era la
línea (`tenant=`), que es justo lo que faltaba para diagnosticar el caso cruzado.

Lo vigila `tests/unit/opt-out-persistence.test.ts`.

---

## Al cliente sí se le contesta — pero solo por Twilio

Hasta el 2026-09-06 quien escribía `SALIR` **no recibía nada**: la rama devolvía un `200`
vacío. No fue una regresión; nunca respondió (se revisó la historia del archivo desde
`06b52ec`). El cliente se quedaba sin saber si había servido.

### Por qué en Twilio sí se puede

La regla de la casa —**solo salen plantillas aprobadas**— gobierna los envíos que
INICIAMOS nosotros: campañas, cumpleaños, reactivaciones. Una confirmación de opt-out no
es eso: es la **respuesta** a un mensaje que el cliente acaba de mandar, dentro de la
ventana de atención de 24 h que abrió él. Sale por el mismo `twimlResponse()` con el que
esa ruta ya le contesta al mesero (`buildDeliveryReply()`) y al comensal que pregunta el
horario (`buildMessage()`). **No es un mecanismo nuevo: es el que ya estaba en producción
en ese archivo.**

Tres textos, en `src/app/api/webhook/twilio-incoming/route.ts`:

- `buildOptOutReply()` — confirma la salida y repite la promesa del panel: los puntos y
  el historial no se tocan. Se manda también cuando `matched = 0`, porque el efecto para
  esa persona es el mismo (no recibe nada).
- `buildOptInReply()` — se parte en dos: a quien tiene ficha se le reactiva algo; a quien
  no la tiene se le dice que no hay nada que reactivar. Decirle «ya vuelves a recibir» al
  segundo sería la misma mentira que se acaba de sacar del log.
- `OPT_OUT_ERROR_REPLY` — cuando la base falló. No se le puede decir «listo» a alguien
  que va a seguir recibiendo campañas.

> Nota operativa: si ese número llegara a estar en la lista de opt-out del propio Twilio,
> el `<Message>` del TwiML fallaría con **21610** y no se entregaría. No es el caso hoy en
> WhatsApp —el Advanced Opt-Out actúa sobre SMS, y por eso las cuatro keywords de prueba
> llegaron a nuestro webhook en vez de ser interceptadas.

### Por qué en Zernio NO se hizo

**No es que sea caro: no existe la salida.** Dos cosas lo impiden a la vez:

1. El webhook de Zernio (`src/app/api/webhook/zernio/route.ts`) solo devuelve un `2xx`
   **sin cuerpo**. No hay nada equivalente a TwiML: no se puede contestar en la misma
   petición.
2. `src/lib/zernio/messaging.ts` expone únicamente `sendZernioTemplateMessage()` y
   `listZernioTemplates()`. **Texto libre no está implementado**, y por diseño
   (`whatsapp.service.ts`).

Un tenant Zernio que responde `SALIR` **queda registrado y deja de recibir** —eso funciona
igual que en Twilio— pero **no recibe confirmación**. Está asumido, no olvidado.

**Qué costaría cerrarlo** (no se hizo; requiere decisión del dueño):

1. Redactar una plantilla de utilidad de una sola variable, del estilo
   `Listo, {{1}} no te enviará más mensajes. Responde ALTA para volver a recibirlos.`
2. Someterla a aprobación de Meta — el ciclo habitual, y se aprueba **por cada cuenta**,
   así que son 25 aprobaciones en el onboarding, no una.
3. Darla de alta en `template-catalog.ts` con su contrato de variables `{{n}}` y su
   entrada en `message_class_map` / `src/constants/messaging.ts` (los dos lados o ninguno).
4. Decidir si ese envío consume presupuesto de la línea (`send-governance.md`). Cuidado
   con el bucle obvio: es un mensaje a alguien que **acaba de pedir no recibir mensajes**;
   si no queda exento del gobierno de envío, o bien lo bloquea `isPhoneOptedOut()` —que
   ya lo marcó un instante antes— o bien hay que abrirle una excepción explícita.

El punto 4 es el que convierte esto en una decisión de producto y no en una tarea.
`tests/unit/opt-out-persistence.test.ts` deja clavada la asimetría para que quien alguna
vez agregue un envío de texto libre por Zernio se tope con este apartado.

---

## Checklist de replicación para nuevo cliente

- [ ] Twilio CLI instalado: `npm install -g twilio-cli`
- [ ] `.env.twilio` con `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN`
- [ ] Crear Messaging Service en Twilio Console (o via CLI)
- [ ] Vincular número WhatsApp al Messaging Service
- [ ] Configurar opt-out keywords (consola o API REST con script arriba)
- [ ] Configurar webhook URL en "When a message comes in"
- [ ] Verificar en consola que `SALIR` aparece en la lista de opt-out keywords

---

## Referencias

- [Twilio Opt-Out Management](https://www.twilio.com/docs/messaging/features/how-to-configure-opt-in-keywords)
- [Twilio Messaging Services API](https://www.twilio.com/docs/messaging/services)
