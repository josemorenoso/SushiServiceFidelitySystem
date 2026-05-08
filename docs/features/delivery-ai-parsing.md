# Feature: Delivery — Parseo con IA (v4)

> Última actualización: v0.23.0
> **Archivos clave:** `n8n/domicilios_whatsapp_v4.json`

## Resumen

El flujo de domicilios recibe mensajes WhatsApp de meseros con datos del pedido. A partir de v0.23.0 el parseo usa OpenAI (gpt-4o-mini) en lugar de regex, permitiendo texto libre del mesero.

## Flujo completo

```
Mesero envía WhatsApp → Twilio → n8n webhook
  → Validar remitente (authorized_numbers en Supabase)
  → IA extrae datos del mensaje libre (OpenAI)
  → Google Contacts: crear/actualizar
  → POST /api/webhook/delivery (datos estructurados)
  → Supabase: crear/actualizar cliente + visita
  → WhatsApp: plantilla near/far/reward al cliente
```

## Cambio clave: regex → IA

### Antes (v3 — regex)
- Requería formato exacto: `Nombre: X\nCelular: X\nDirección: X`
- Si el mesero cambiaba el orden o formato, fallaba

### Ahora (v4 — IA)
- El mesero envía texto libre: `"pedido de Juan 3001234567 calle 100 pago efectivo 35mil"`
- OpenAI extrae JSON estructurado con los campos necesarios
- Funciona con errores de ortografía, orden aleatorio, abreviaciones

## Prompt de extracción

```
Eres un asistente que extrae datos de pedidos de domicilio desde mensajes de WhatsApp.
Del siguiente mensaje, extrae estos campos en JSON:
- nombre_cliente (string) — nombre del cliente
- celular (string) — solo los 10 dígitos, sin +57
- direccion (string | null) — dirección de entrega
- metodo_pago (string | null) — efectivo, transferencia, nequi, daviplata, etc.
- monto_total (number | null) — valor total en COP (sin puntos ni $)

Si no puedes extraer un campo, usa null. El celular es OBLIGATORIO.
Responde SOLO con el JSON, sin explicaciones.

Mensaje: "{message}"
```

## Variables de entorno adicionales en n8n

| Variable | Descripción |
|----------|-------------|
| `OPENAI_API_KEY` | Key de OpenAI para el nodo de IA (gpt-4o-mini) |

## Archivos afectados
- `n8n/domicilios_whatsapp_v4.json` — workflow actualizado con nodo OpenAI
- `n8n/README.md` — documentación del workflow
