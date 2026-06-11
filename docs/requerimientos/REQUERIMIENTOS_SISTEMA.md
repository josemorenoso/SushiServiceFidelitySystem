# Requerimientos del Sistema — RestaurantQR

> Documento para desarrollador experto. Fecha: 2026-06-10

> **Organización:** Los requerimientos están agrupados por prioridad (P1 → P2 → P3).
> Cada requerimiento tiene un check `- [ ] Desarrollado`. Al completar TODOS los P1 se pasa a P2, y así sucesivamente.

---

# 🔴 P1 — Alta Prioridad

## P1.1 — Días de Reactivación Configurables (Req 6 — Fase A)

- [x] **Desarrollado** — v1.4.0 (2026-06-10). Settings keys `reactivation_soft_days`/`reactivation_aggressive_days`, UI en Ajustes > Reactivación de Clientes, cron actualizado.

**Problema actual:**
- La reactivación automática está fija en 21 días para todos los negocios.
- No todos los negocios tienen el mismo ciclo de visita (ej. barbería vs. restaurante).

**Requerimiento:**
- Permitir en configuración ajustar los días de reactivación:
  - Reactivación suave: configurable (default 21 días).
  - Reactivación agresiva: configurable (default 25 días).
- Estos valores deben ser editables desde el panel de Settings.

**Impacto:** Alto · **Complejidad:** Baja · *Quick win.*

---

## P1.2 — Rediseño del Flujo de Reseñas (Review UX) (Req 1)

- [x] **Desarrollado** — v1.4.0 (2026-06-10). `GoogleReviewCard` inline (sin modal), CTA siempre habilitado, rating interno separado. Doc: `docs/features/review-flow.md`.

**Problema actual:**
- El popup de reseñas muestra estrellas (rating) que confunden al usuario.
- Los usuarios creen que al tocar 5 estrellas están dejando la reseña en Google directamente.
- Ignoran el botón real de redirección a Google Reviews.
- Comportamiento automático de cierre: apenas aparece el popup, el usuario lo cierra instintivamente (patrón de "cerrar modal").

**Requerimiento:**
- Rediseñar la experiencia de solicitud de reseña para eliminar la confusión.
- Separar claramente el rating interno (opcional) de la acción de ir a Google Reviews.
- Reducir el "instinct close": considerar timing, microcopy, o un flujo que no dependa de un modal tradicional.
- Garantizar que el usuario entienda que debe hacer clic en un botón para ir a Google y dejar la reseña real.

**Impacto:** Alto (conversión de reseñas en Google) · **Complejidad:** Media.

---

## P1.3 — Rediseño del Módulo de Campañas (UX Visual e Intuitivo) (Req 5)

- [x] **Desarrollado** — v1.4.0 (2026-06-10). KPIs, badges de estado real, preview de plantilla, días dinámicos, historial en español.

**Problema actual:**
- La interfaz de campañas es confusa para los dueños de restaurante.
- Las campañas automáticas (ej. reactivación) no se entienden visualmente.
- Falta claridad en el estado, progreso, y configuración de cada campaña.

**Requerimiento:**
- Rediseñar el módulo de campañas con enfoque en:
  - Visualización clara de campañas activas, pausadas, finalizadas.
  - Cards o timeline intuitivo para campañas automáticas.
  - Editor visual de campañas (quién recibe, cuándo, qué mensaje).
  - Preview del mensaje antes de enviar.
  - Métricas resumidas por campaña: enviados, abiertos, conversiones.
- Separar explícitamente campañas manuales vs. automáticas.

**Impacto:** Alto (adopción por dueños no técnicos) · **Complejidad:** Media-Alta.

---

# 🟡 P2 — Media Prioridad

> ⚠️ Solo iniciar P2 cuando TODOS los P1 tengan check de desarrollado.

## P2.1 — QRs Dinámicos para Promociones y Activaciones (Req 3)

- [ ] **Desarrollado**

**Problema actual:**
- Los QRs existentes son estáticos (ej. QR de mesa o fidelización).
- No hay forma de crear QRs temporales o personalizados para eventos específicos (ej. "2x1 este fin de semana", "Happy Hour", campaña de activación).

**Requerimiento:**
- Sistema de generación de QRs dinámicos desde el dashboard.
- Cada QR dinámico debe poder configurarse con:
  - Nombre / descripción de la promoción.
  - Vigencia (fecha inicio y fin).
  - Tipo de acción al escanear: redirigir a promo, aplicar automáticamente un beneficio, registrar participación, etc.
  - Posibilidad de desactivar o regenerar.
- Tracking de escaneos por QR dinámico.

**Impacto:** Medio-Alto (marketing operativo ágil) · **Complejidad:** Media.

---

## P2.2 — Indicador de Estado de N8N (Health Check) (Req 4)

- [ ] **Desarrollado**

**Problema actual:**
- No hay forma visual en el panel del administrador de saber si la instancia de N8N está viva o caída.
- Si N8N falla, los flujos automáticos (webhooks, campañas, notificaciones) dejan de funcionar sin aviso.

**Requerimiento:**
- Agregar un widget o indicador pequeño ("health badge") en el dashboard que muestre:
  - Estado actual de N8N: ✅ Funcionando / ❌ Caído / ⚠️ Degradado.
  - Último heartbeat recibido (timestamp).
- Implementar un endpoint de health check que pregunte a N8N (o a un webhook de prueba) y reporte estado.
- Opcional: alerta visual si lleva más de X minutos sin respuesta.

**Impacto:** Medio (detección temprana de fallos) · **Complejidad:** Baja · *Quick win.*

---

## P2.3 — Dashboard de Métricas de Twilio (SMS/WhatsApp) (Req 2)

- [ ] **Desarrollado**

**Problema actual:**
- No hay visibilidad de métricas de entrega de mensajes.
- No se puede ver cuántos usuarios han hecho Opt-Out.
- No hay datos de tasa de apertura/vista de mensajes.
- No se distinguen estados: entregado, fallido, no entregado, leído.

**Requerimiento:**
- Integrar métricas de Twilio (Message Delivery, Read Receipts, Opt-Outs) en el dashboard administrativo.
- Mostrar al menos:
  - Total de mensajes enviados / entregados / fallidos / no entregados.
  - Tasa de apertura (visto) cuando aplique (WhatsApp).
  - Cantidad y lista de Opt-Outs (usuarios que respondieron STOP o equivalente).
  - Posiblemente gráfico de evolución temporal.

**Impacto:** Medio (control de calidad y compliance) · **Complejidad:** Media.

---

# 🟢 P3 — Baja Prioridad (Largo Plazo)

> ⚠️ Solo iniciar P3 cuando TODOS los P2 tengan check de desarrollado.

## P3.1 — Reactivación Adaptativa por Cliente (Req 6 — Fase B)

- [ ] **Desarrollado**

**Problema actual:**
- No hay personalización del trigger de reactivación basada en el comportamiento real del cliente.

**Requerimiento:**
- Implementar un sistema de "día de reactivación adaptativo" por cliente:
  - Después de 3-4 visitas del cliente, calcular su intervalo promedio entre visitas.
  - Si el cliente muestra un patrón predecible (ej. cada 15 días), ajustar el trigger de reactivación a su propio ritmo (ej. 15 días + margen) en lugar del global.
- Esto implica:
  - Almacenar historial de intervalos entre visitas por cliente.
  - Algoritmo de predicción simple (promedio móvil o mediana).
  - Override del trigger global por cliente cuando haya confianza estadística suficiente.
  - Posible flag por negocio para activar/desactivar modo adaptativo.

**Impacto:** Alto (mayor precisión, menos spam) · **Complejidad:** Alta (lógica de predicción, cambios en scheduler, almacenamiento de patrones por cliente).

---

## Resumen de Priorización

| Prioridad | # | Requerimiento | Impacto | Complejidad | Desarrollado |
|-----------|---|---------------|---------|-------------|:---:|
| P1 | P1.1 | Días Reactivación Configurable (6A) | Alto | Baja | ✅ v1.4.0 |
| P1 | P1.2 | Rediseño Reseñas (1) | Alto | Media | ✅ v1.4.0 |
| P1 | P1.3 | Rediseño Campañas (5) | Alto | Media-Alta | ✅ v1.4.0 |
| P2 | P2.1 | QRs Dinámicos (3) | Medio-Alto | Media | [ ] |
| P2 | P2.2 | Health Check N8N (4) | Medio | Baja | [ ] |
| P2 | P2.3 | Dashboard Twilio (2) | Medio | Media | [ ] |
| P3 | P3.1 | Reactivación Adaptativa (6B) | Alto | Alta | [ ] |

---

## Contexto Directo para la IA (archivos a leer — NO explorar el codebase)

> Cuando una IA desarrolla, antes de codear busca: la arquitectura del proyecto, el schema de DB, los servicios/componentes que va a tocar, y las convenciones existentes. Para ahorrar tokens, aquí están los archivos EXACTOS por requerimiento. **Leer SOLO estos, no hacer búsquedas generales.**

### Siempre (cualquier requerimiento)
- `docs/01-project-overview.md` — visión y stack
- `docs/02-architecture.md` — estructura de carpetas y convenciones
- `docs/DB_SCHEMA.md` — solo si toca base de datos
- `docs/API_DOCS.md` — solo si toca endpoints

### Req 1 — Rediseño Reseñas
- `src/components/features/check-in/GoogleReviewPopup.tsx` — el popup actual con las estrellas
- `src/components/features/check-in/CheckInSuccess.tsx` — donde se monta el popup (estado `showReview`)
- Env var: `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL`

### Req 2 — Dashboard Twilio
- `src/services/whatsapp.service.ts` — envío de templates, códigos de error Twilio (63016 = opt-out)
- `docs/features/twilio-opt-out.md` — manejo actual de opt-out
- `docs/CONFIGURACIONES_TWILIO_SISTEMA.md` — config Twilio del sistema
- `src/services/dashboard.service.ts` — métricas existentes del dashboard
- `src/app/(dashboard)/dashboard/page.tsx` — UI del dashboard principal

### Req 3 — QRs Dinámicos
- `src/lib/utils/qrcode.ts` — generación QR actual
- `src/app/(dashboard)/dashboard/qr/page.tsx` — página QR actual del dashboard
- `docs/features/qr-checkin.md` — flujo de check-in por QR
- `src/app/(public)/check-in/page.tsx` — destino actual del QR

### Req 4 — Health Check N8N
- `docs/n8n-workflows/README.md` — workflows N8N existentes
- `docs/INFRAESTRUCTURA.md` — dónde corre N8N
- `src/app/(dashboard)/dashboard/page.tsx` — dónde colocar el badge de estado

### Req 5 — Rediseño Campañas
- `src/app/(dashboard)/dashboard/campaigns/page.tsx` — UI actual de campañas
- `src/services/campaign.service.ts` — lógica de campañas (caps, frecuencia, mensajes)
- `docs/features/campaigns.md` — doc de la feature
- `docs/features/flujo-plantillas-recompensas-campanas.md` — flujo completo plantillas→campañas
- `src/app/(dashboard)/dashboard/calendar/page.tsx` — campañas de calendario relacionadas

### Req 6 — Reactivación Configurable + Adaptativa
- `src/constants/rewards.ts` — `REACTIVATION_DAYS = 21`, `REACTIVATION_AGGRESSIVE_DAYS = 25` (hardcoded hoy)
- `src/app/api/cron/reactivation/route.ts` — cron de reactivación (suave + agresiva)
- `src/services/campaign.service.ts` — `findInactiveCustomers()` usa el cutoff de días
- `src/services/settings.service.ts` — cómo se leen settings de `admin_settings`
- `src/app/(dashboard)/dashboard/settings/page.tsx` — UI de Settings donde agregar los campos
- `docs/DB_SCHEMA.md` — tabla `customers` (para Fase B: intervalos entre visitas)

### Reglas del proyecto que la IA DEBE respetar
- Leer `METODO_AINNOVATE.md` (raíz) — 12 mandamientos del proyecto
- Actualizar `CHANGELOG.md` con cada cambio
- TypeScript estricto, cero `any`
- Settings configurables van en tabla `admin_settings` (key/value), no en constantes

---

## Preguntas para el Desarrollador

1. **Twilio:** ¿Usamos Twilio Messaging Service o WhatsApp Business API? ¿Qué métricas están ya disponibles via API?
2. **N8N:** ¿N8N está self-hosted o en n8n.cloud? ¿Existe ya un webhook de health que podamos pinguear?
3. **QRs Dinámicos:** ¿Se prefieren QRs que redirigen a URLs temporales o que activan lógica directa en el backend al escanear?
4. **Campañas:** ¿Hay un sistema de plantillas de mensajes ya existente que deba respetarse?
5. **Reactivación:** ¿El scheduler actual corre en N8N, cron interno, o Supabase Edge Functions?

---

*Documento preparado para estimación y planificación de sprint.*
