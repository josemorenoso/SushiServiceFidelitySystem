# Análisis de Escalabilidad — Constelarys Fidelity System

> v0.23.0

## Arquitectura actual

```
Cliente (QR/WhatsApp) → Vercel (serverless) → Supabase (PostgreSQL)
                                             → Twilio (WhatsApp)
                                             → n8n VPS (workflows)
```

## Límites por capa

### 1. Vercel (Serverless Functions)

| Métrica | Free tier | Pro ($20/mes) |
|---------|:---------:|:-------------:|
| Invocaciones/mes | 100K | 1M |
| Duración max/función | 10s | 60s |
| Concurrencia | ~50 simultáneas | ~100 simultáneas |
| Bandwidth | 100GB/mes | 1TB/mes |

**¿Cuántos check-ins simultáneos?**
- Cada check-in = 1 invocación de ~200ms
- **50 simultáneos** = un restaurante lleno escaneando QR al mismo tiempo → no es problema realista
- **~500K check-ins/mes** en free tier (sobra para 3 restaurantes)

**¿Qué lo puede tumbar?**
- Campañas manuales a >50 clientes (timeout 10s en free). Resuelto en v0.22.0 con batch paralelo
- DDoS al endpoint público `/api/check-in`. Resuelto con rate limiting

**Nota:** Vercel free plan NO tiene cron triggers nativos. Los crons de cumpleaños/reactivación son disparados por n8n (Schedule → HTTP POST a Vercel).

### 2. Supabase (PostgreSQL)

| Métrica | Free tier | Pro ($25/mes) |
|---------|:---------:|:-------------:|
| Filas máximas | Sin límite técnico | Sin límite |
| Almacenamiento DB | 500MB | 8GB |
| Requests/segundo | ~200 | ~1000 |
| Conexiones directas | 20 | 100 |
| Pooler connections | 200 | 500 |
| Bandwidth | 5GB/mes | 250GB/mes |

**¿Cuántos clientes aguanta?**
- 1 cliente ≈ 0.5KB en DB
- 500MB = **~1 millón de clientes** en free tier
- 100 clientes/día × 365 = 36.5K/año → 14 años antes de llenar el free tier

### 3. Twilio (WhatsApp)

| Métrica | Valor |
|---------|:-----:|
| Rate limit envío | 1 msg/segundo (sandbox), 80 msg/s (producción) |
| Costo por msg (Colombia) | ~$0.005-0.015 USD |
| Templates pendientes aprobación | Hasta 24h para aprobar |

**¿Qué lo puede tumbar?**
- Enviar campaña masiva sin batch. Resuelto (batch de 10 con Promise.all)
- Mandar >1000 WhatsApp sin messaging service → throttling

### 4. n8n (VPS)

| Métrica | Valor típico (VPS $15/mes) |
|---------|:---------:|
| Workflows simultáneos | ~20-30 |
| Ejecuciones/hora | ~500-1000 |
| RAM necesaria | ~512MB-1GB |

**¿Qué lo puede tumbar?**
- Si OpenAI (parseo de domicilios) tarda >30s → timeout de Twilio y reintento
- Mitigación: gpt-4o-mini responde en 1-3s. Timeout de Twilio es 15s. Suficiente.

## Registros diarios realistas

| Escenario | Check-ins/día | Domicilios/día | Total |
|-----------|:------------:|:--------------:|:-----:|
| 1 restaurante pequeño | 30-50 | 10-20 | 40-70 |
| 1 restaurante mediano | 80-150 | 30-60 | 110-210 |
| 3 restaurantes simultáneos | 150-450 | 50-150 | 200-600 |

**Capacidad real del sistema**: ~10.000 registros/día sin problemas (Vercel free + Supabase free + Twilio).

## Protecciones ya implementadas

1. **Rate limiting** por IP en check-in y webhook delivery
2. **Batch paralelo** en campañas manuales (evita timeout)
3. **Fail-closed** en webhooks (si falta secret, rechaza)
4. **Best-effort** en WhatsApp y Google Contacts (si falla, el check-in no se rompe)
5. **Security headers** (HSTS, CSP, X-Frame-Options)
6. **Duplicate check-in** protection (1 por día por cliente)

## Cuándo escalar

1. **Upstash Redis** para rate limiting distribuido (reemplaza in-memory)
2. **Vercel Pro** si superas 100K invocaciones/mes (~$20/mes)
3. **Supabase Pro** si superas 500MB DB o necesitas backups automáticos
4. **Twilio Messaging Service** si envías >100 WhatsApp/día por número

## Resumen ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| ¿Cuántos registros simultáneos? | **50+** (limitado por Vercel concurrency) |
| ¿Cuántos diarios? | **~10.000** sin problemas |
| ¿Cuántos clientes en DB? | **~1 millón** en free tier |
| ¿Se va a caer? | **No** para volumen de restaurante típico |
| ¿Cuándo escalar? | Cuando tengas >5 restaurantes activos o >1000 check-ins/día por restaurante |

## Breakdown de Costos por Cliente (USD/mes)

| Servicio | Plan | Costo USD/mes |
|----------|------|:-------------:|
| Vercel | Hobby (gratis) | $0 |
| Supabase | Free tier | $0 |
| Twilio WhatsApp | Pay-as-you-go | ~$5-15 |
| VPS (n8n compartido) | ~$3-5 por cliente | $3-5 |

### Pricing sugerido al cliente final

| Plan | Mensual COP | Incluye |
|------|:-----------:|---------|
| **Básico** | $89.000 | Hasta 200 clientes, 500 WhatsApp/mes, soporte email |
| **Pro** | $149.000 | Ilimitado, campañas manuales, soporte prioritario |
| **Enterprise** | $249.000 | Multi-sede, analytics avanzados, soporte 24/7 |
