# Sesión 2026-05-09 — Control de Tráfico Centralizado

## Problema identificado

Dos motores de envío operaban sin comunicarse entre sí:
- **Motor 1 (automático):** cron de reactivación a los 21 días de inactividad
- **Motor 2 (manual):** campañas masivas lanzadas por el admin desde el dashboard

Sin coordinación, un cliente podía recibir un blast manual el martes y la reactivación personalizada el miércoles.

---

## Diagnóstico: qué ya existía vs. qué faltaba

### Ya funcionaba ✅
| Mecanismo | Cómo |
|-----------|------|
| Campo `last_campaign_at` en customers | Migración 6, ya en producción |
| Frequency cap 7 días en campañas manuales | `manual/route.ts` filtraba y actualizaba el campo |
| Reset por interacción (Regla 3) | `findInactiveCustomers()` usa `last_visit_at < 21d`; si el cliente visita, sale del pool automáticamente |

### Faltaba ❌
| Hueco | Consecuencia |
|-------|-------------|
| `findInactiveCustomers()` ignoraba `last_campaign_at` | Cron de reactivación disparaba aunque el cliente recibió un manual ayer |
| Crons no actualizaban `last_campaign_at` | Después de una reactivación automática, el siguiente blast manual no sabía que el cliente fue contactado |
| Sin Zona de Recuperación en campañas manuales | Un blast genérico podía interceptar al cliente justo cuando el cron personalizado de 21 días estaba por disparar |

---

## Solución implementada — v0.24.0

### Tres reglas del Control de Tráfico Centralizado

**Regla 1 — Master Cap Global (7 días)**
`customers.last_campaign_at` es la fuente de verdad. Ningún cliente recibe mensaje (manual ni automático) si fue contactado hace menos de 7 días. Ahora todo envío exitoso actualiza este campo, incluyendo los crons.

**Regla 2 — Zona de Recuperación (días 18-25 sin visita)**
Clientes inactivos entre 18 y 25 días están bloqueados para campañas manuales. Están reservados para el cron de reactivación personalizado del día 21, que tiene mayor tasa de conversión al ser hiper-contextual al ciclo del cliente.

**Regla 3 — Reset por Interacción (ya existía)**
Cualquier visita o domicilio actualiza `last_visit_at`, sacando al cliente del pool de reactivación automáticamente.

### Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `src/constants/rewards.ts` | Añadidas: `FREQUENCY_CAP_DAYS=7`, `RECOVERY_ZONE_START_DAYS=18`, `RECOVERY_ZONE_END_DAYS=25` |
| `src/services/campaign.service.ts` | `findInactiveCustomers()` respeta `last_campaign_at`; nueva función `updateCustomerLastCampaignAt()` |
| `src/app/api/cron/reactivation/route.ts` | Recolecta `sentCustomerIds` y llama `updateCustomerLastCampaignAt()` al final |
| `src/app/api/cron/birthday/route.ts` | Mismo patrón que reactivación |
| `src/app/api/dashboard/campaigns/manual/route.ts` | Exclusión de Recovery Zone, `last_visit_at` añadido al select, `totalSkippedRecoveryZone` en response |
| `src/app/api/dashboard/campaigns/estimate/route.ts` | Frequency cap + Recovery Zone aplicados al count SQL |
| `docs/features/campaigns.md` | Documento completo del sistema (tabla de decisión, flujos, constantes) |

---

## Cómo usar las campañas manuales correctamente

### Segmentos naturales para campañas manuales

**Segmento A — Clientes activos (0-17 días desde última visita)**
No están en la Zona de Recuperación. Audiencia principal para:
- Nuevo plato / menú de temporada
- Evento especial o reservas
- Promoción de fin de semana
- Programa de referidos

**Segmento B — Clientes perdidos (25+ días sin visitar)**
El cron de reactivación ya disparó (o falló). Son el segundo intento con oferta más agresiva si el dueño quiere recuperarlos.

### Lo que el sistema hace solo (sin intervención del admin)
- Visita → bienvenida / recompensa automática
- Día 18-25 sin visita → zona protegida, nadie interviene
- Día 21 → reactivación personalizada automática
- Cumpleaños → felicitación automática

---

## Preguntas frecuentes (Q&A de la sesión)

### ¿Cada cuánto se puede correr una campaña?
El cap de 7 días es **por cliente**, no por campaña. Puedes lanzar campañas tan seguido como quieras — el sistema salta a los clientes contactados recientemente y reporta cuántos fueron omitidos (`totalSkippedFrequencyCap`). En la práctica, 1-2 campañas por semana es lo razonable.

### Si corro una campaña el día 18 y el cliente no viene hasta el día 22, ¿igual recibe la reactivación del día 21?

**Sí, la reactivación dispara normalmente.** El cliente en el día 18 ya está dentro de la Zona de Recuperación (18-25 días), por lo que la campaña manual lo excluye automáticamente. El cron del día 21 lo encuentra intacto y dispara.

### ¿Qué pasa si corro una campaña el día 17 (un día antes de la zona)?

El cliente recibe el mensaje manual → `last_campaign_at` = día 17. Cuando el cron del día 21 corre, ve que `last_campaign_at` tiene solo 4 días de antigüedad (< 7 días) → **lo excluye automáticamente**. La Zona de Recuperación empieza en el día 18 precisamente para dar ese margen de 3-4 días de protección.

---

## Tabla de decisión por día de inactividad

| Días sin visita | ¿Campaña manual llega? | ¿Cron reactivación llega? |
|:-:|:-:|:-:|
| 0 - 17 | ✅ (sujeto a cap 7d) | ❌ no inactivo aún |
| 18 - 25 | ❌ Recovery Zone | ✅ dispara al día 21 |
| 25+ | ✅ (sujeto a cap 7d) | ❌ ya disparó, no repite en 30d |

---

## Frecuencia máxima de contacto por cliente (resumen)

| Tipo de mensaje | Frecuencia máxima |
|-----------------|-------------------|
| Bienvenida / recompensa (transaccional) | Cada visita — sin cap |
| Campaña manual | 1 cada 7 días |
| Reactivación automática | 1 cada ~30 días |
| Cumpleaños | 1 por año |
