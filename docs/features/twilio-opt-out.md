# Twilio Opt-Out — Configuración de Keywords y Replicación Rápida

> **Feature:** Configuración de opt-out/in/help keywords en español para el Messaging Service de Twilio.
> **Última actualización:** 2026-06-01

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

1. Twilio bloquea automáticamente ese número.
2. Futuros envíos devuelven error **21610** (`Attempt to send to opted out recipient`).
3. El sistema loguea este error en `whatsapp.service.ts` con el código completo para diagnóstico.
4. El cliente puede reactivarse respondiendo cualquier keyword de opt-in (ej: `ALTA`, `START`).

### Manejo en el código

En `src/services/whatsapp.service.ts` el envío de WhatsApp atrapa el error 21610:

```typescript
if (error.code === 21610 || error.code === "21610") {
  // Cliente opt-out — no reintentar, no loguear como crítico
  console.warn(`[Twilio] Cliente ${to} está opt-out. Saltando envío.`);
}
```

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
