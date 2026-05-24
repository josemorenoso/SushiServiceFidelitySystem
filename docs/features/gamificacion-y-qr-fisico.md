# Propuesta: Sistema de Gamificación Organizado y QR Físico

> **Estado:** Propuesta (no implementada)
> **Fecha:** 2026-05-23
> **Origen:** Diagnóstico de meseros — los clientes no escanean / no completan registro / opt-out posterior
> **Archivos que tocaría al implementarse:** `src/components/features/check-in/CheckInForm.tsx`, `src/components/features/check-in/CheckInSuccess.tsx`, `src/app/(public)/check-in/page.tsx`, plantillas Twilio, activos físicos imprimibles
> **Documentos relacionados:** `qr-checkin.md`, `campaigns.md`, `flujo-plantillas-recompensas-campanas.md`

---

## 1. Problema diagnosticado

El embudo de adquisición tiene tres caídas independientes:

| Etapa | Síntoma reportado | Causa raíz |
|-------|-------------------|------------|
| **Escaneo** | Clientes ignoran el QR físico | QR sin promesa visible. Guion del mesero suena a trámite ("regístrate aquí") |
| **Submit de datos** | Quienes escanean no completan registro | Pantalla 1 (`/check-in`) pide celular sin comunicar beneficio. No hay "para qué" |
| **Retención / opt-out** | Algunos hacen opt-out tras primer mensaje | Primer WhatsApp es transaccional ("gracias"), no entrega valor. Cadencia no se anuncia |

**Diagnóstico del sistema actual de gamificación**: el sistema gamifica bien la *retención* (roadmap, BLACK tier, mensajes variables) pero **no gamifica la adquisición** (todo lo visible PRE-escaneo es neutro/burocrático).

---

## 2. Principios de diseño aplicados

| Principio | Cómo se usa en esta propuesta |
|-----------|-------------------------------|
| **Promesa antes de costo** | El beneficio concreto se muestra ANTES de pedir el celular |
| **Endowed Progress Effect** | El roadmap visible antes del registro hace que el cliente "ya se vea" ganando |
| **Goal Gradient** | "Falta 1 paso para tu postre" acelera completar el formulario |
| **Curiosity Gap** | QR físico promete premio sin revelarlo completamente |
| **Loss Aversion** | Primer WhatsApp con recompensa que caduca |
| **Expectation Setting** | Cadencia de comunicación anunciada explícitamente para reducir opt-out |
| **Variable Reward Schedule** | Ya implementado (plantillas milestone / falta 1 / faltan 2+) |
| **Status/Tier** | Ya implementado (BLACK tier) |

---

## 3. Diseños de QR físico (A/B test público)

### Diseño A — "Rasca y Gana" (Curiosity Gap)

**Formato:** tent card vertical 15×20 cm, cartón rígido por mesa.

**Estructura visual:**
- Header rojo `#E63946`: "🎁 TU MESA TIENE UN PREMIO HOY"
- QR central 7×7 cm con marco dorado punteado
- Microcopy: "Escanea y descúbrelo"
- Roadmap de premios visible:
  - ★ Visita 3 → Postre
  - ★ Visita 5 → Bebida
  - 👑 Visita 7 → BLACK
- Social proof footer: "+500 clientes ya están adentro"

**Triggers:** curiosity gap + recompensa garantizada + roadmap anclado + social proof.

**Guion mesero:** *"En esta mesa tienen premio garantizado, escanéenlo cuando quieran".*

---

### Diseño B — "Tarjeta VIP Premium" (Status + Identidad)

**Formato:** tarjeta CR80 (8.5×5.4 cm), cartulina premium negra mate o plastificada.

**Estructura visual:**
- Estética BLACK (coherente con el tier máximo del sistema)
- Header dorado: "MIEMBRO VIP"
- QR pequeño (no protagónico) en esquina
- Iconografía de progreso: ⭐ ⭐ ⭐ → 👑
- Microcopy: "Escanea para activar tu nivel"

**Triggers:** estatus aspiracional + tangibilidad física + coherencia con design system BLACK existente.

**Guion mesero:** *"Esto es nuestro programa VIP, te activa premios gratis solo por venir. Te dejo la tarjeta".*

---

### Comparación operativa

| Dimensión | Diseño A (Rasca y Gana) | Diseño B (VIP Premium) |
|-----------|-------------------------|------------------------|
| **Costo unitario estimado** | Medio (cartón rígido grande) | Alto (PVC plastificado) o medio (cartulina premium) |
| **Reposición** | Cada 30-60 días (manchas, desgaste) | Cada 90-180 días (más durable) |
| **Distribución** | 1 por mesa (visible siempre) | 1 por mesa + cliente puede llevársela |
| **Hipótesis de eficacia** | Mayor *adquisición* (curiosidad gana en short-term) | Mayor *retención* (construye identidad) |
| **Rentabilidad short-term** | Probable ganadora | Probable runner-up |
| **Rentabilidad long-term** | Empate o pierde | Probable ganadora |
| **Satisfacción del cliente** | "Me llamó la atención" | "Me sentí especial" |
| **Riesgo** | Estética puede percibirse como "muy comercial" | Costo si no escanean igual |

**Recomendación:** producir ambos, distribuir 50/50 en mesas durante 2 semanas, comparar `visits.source='qr'` segmentado por mesa (ya disponible vía query param `?mesa=N`). Encuesta pública complementaria sobre percepción.

---

## 4. Sistema de gamificación organizado por etapas

### Etapa 0 — PRE-escaneo (QR físico)
- **Mensaje principal**: promesa concreta visible (no "escanea aquí")
- **Visual**: roadmap de premios impreso
- **Guion mesero**: framing de regalo, no de trámite

### Etapa 1 — Post-escaneo, antes de pedir datos
**Pantalla `/check-in` step `phone` rediseñada:**

Cambios vs. estado actual ([CheckInForm.tsx:178-246](src/components/features/check-in/CheckInForm.tsx#L178-L246)):

| Elemento | Hoy | Propuesta |
|----------|-----|-----------|
| **Título** | "Bienvenido" | "🍰 TU PRIMER POSTRE VA POR LA CASA" |
| **Subtítulo** | "Ingresa tu número de celular para continuar" | "Solo necesitamos tu número:" |
| **CTA** | "Continuar" | "Reclamar mi postre →" |
| **Roadmap visible** | ❌ (solo aparece tras éxito) | ✅ Visible ANTES del input |
| **Cadencia anunciada** | ❌ | ✅ "🕐 1 mensaje/semana máximo" |

### Etapa 2 — Registro (cliente nuevo)
**Pantalla `/check-in` step `register` rediseñada:**

Cambios vs. estado actual ([CheckInForm.tsx:248-441](src/components/features/check-in/CheckInForm.tsx#L248-L441)):

| Elemento | Hoy | Propuesta |
|----------|-----|-----------|
| **Encabezado** | "Regístrate" + "Es tu primera vez..." | "✓ Número guardado" + "Falta 1 paso para tu postre 🍰" |
| **Checkbox marketing** | "Acepto ser parte de la familia y recibir regalos, recompensas y comunicaciones por WhatsApp" (disclaimer) | "☑ Sí, quiero mis regalos y avisos VIP por WhatsApp" (beneficio enmarcado) |
| **CTA** | "Registrarme" | "Activar mi postre →" |

### Etapa 3 — Post-registro (pantalla éxito)
**Ya bien gamificada** en [CheckInSuccess.tsx](src/components/features/check-in/CheckInSuccess.tsx). Sin cambios.

### Etapa 4 — Primer WhatsApp (anti opt-out, palanca 1)
**Cambio crítico** vs. plantilla actual de bienvenida:

| | Hoy (transaccional) | Propuesta (utilidad inmediata) |
|---|---------------------|-------------------------------|
| **Copy** | "Hola Juan, gracias por unirte a la familia [restaurante]" | "Juan, este mensaje es tu postre 🍰 — muéstraselo al mesero antes de irte. Caduca esta noche." |
| **Efecto** | Crea recuerdo de "spam" | Crea anclaje "esta marca me da cosas gratis" |
| **Métrica clave** | Opt-out rate | Redención + opt-out rate |

### Etapa 5 — Segundo WhatsApp (anti opt-out, palanca 2)
Mensaje "contrato" tras la primera redención:

> "Quedaste registrado ✓
> Te escribimos: tu cumpleaños, cuando ganes premio, y máximo 1 promo/semana.
> Para pausar: responde PAUSA. Para salir: responde SALIR."

**Efecto esperado:** pre-anunciar la cadencia reduce opt-out hasta ~40% (referencia: plataformas de WhatsApp marketing). La gente no se va por recibir mensajes, se va por sorpresa negativa.

### Etapa 6 — Cadencia continua (anti opt-out, palanca 3)
Ya implementado en [rewards.ts:6](src/constants/rewards.ts#L6) con `FREQUENCY_CAP_DAYS = 7`. **Pendiente**: hacer visible el límite al cliente (en pantalla 1 y en mensaje de bienvenida).

---

## 5. Embudo de métricas para validar

Toda la data ya existe en la DB (sin herramientas nuevas):

| Etapa | Métrica | Fuente |
|-------|---------|--------|
| Escaneo | Hits a `/check-in` por mesa | Logs Vercel + query param `?mesa=N` |
| Lookup celular | Submits del step `phone` | `visits` (`source='qr'`) + lookups en logs |
| Completar registro | Nuevos `customers` por día | `customers.created_at` |
| Opt-in marketing | % con `accepts_marketing=true` | Query directa |
| No opt-out 30d | `customers` sin `marketing_opted_out_at` | Query directa |
| Redención 1er premio | Reclamos del welcome postre | Métrica nueva a instrumentar |

**Hipótesis a validar:**
- H1: la pantalla rediseñada sube conversión `lookup → register completado` ≥ 25%
- H2: el checkbox marketing enmarcado como beneficio sube opt-in ≥ 30%
- H3: el primer WhatsApp con utilidad inmediata reduce opt-out 30d ≥ 40%

---

## 6. Plan de implementación priorizado

| # | Acción | Esfuerzo | Impacto | Prerequisito |
|---|--------|----------|---------|--------------|
| 1 | Rediseñar copy pantalla 1 (promesa + roadmap + cadencia) | Bajo (1 archivo) | Alto | Ninguno |
| 2 | Rediseñar checkbox marketing como beneficio | Bajo (1 archivo) | Medio | Ninguno |
| 3 | Producir e imprimir Diseño A y Diseño B (50/50) | Medio (proveedor físico) | Alto | Aprobar artes |
| 4 | Cambiar plantilla Twilio de bienvenida a "recompensa caduca hoy" | Medio (plantilla + lógica redención) | Alto | Twilio template approval |
| 5 | Crear plantilla "contrato" post-primera-redención | Medio | Medio | Twilio template approval |
| 6 | Instrumentar embudo de métricas en dashboard | Medio | Alto | Plan 1-5 desplegado |
| 7 | Encuesta pública A/B percepción de QR | Bajo | Medio | QRs en mesa ≥ 2 semanas |

**Quick win recomendado**: arrancar por #1 — mayor ROI, cero riesgo, un solo archivo. Resto en olas siguientes.

---

## 7. Restricciones y consideraciones

- Los cambios de copy en pantalla 1 y 2 NO requieren cambios de schema, API ni servicios. Son ediciones puras de UI.
- Los cambios de plantilla Twilio requieren aprobación de WhatsApp Business y prueba en sandbox antes de producción.
- El QR físico A/B testing requiere coordinación con el equipo de mesa para no mezclar diseños en una misma sesión de cliente.
- Mantener el design system actual (`premium-card`, `font-playfair`, `#E63946`) — esta propuesta refuerza la coherencia visual, no la reemplaza.
- La línea "1 mensaje/semana máximo" debe ser cierta en operación, no solo en copy. Validar contra `FREQUENCY_CAP_DAYS = 7`.

---

## 8. Pendiente

- [ ] Aprobar copy final pantalla 1 y 2
- [ ] Aprobar artes físicas Diseño A y Diseño B
- [ ] Definir presupuesto de impresión + proveedor
- [ ] Redactar plantillas Twilio nuevas (bienvenida-con-recompensa + contrato)
- [ ] Diseñar query/view para embudo de métricas
- [ ] Definir periodo y métricas de éxito del A/B físico
- [ ] Definir mecanismo de redención del primer postre (cómo el mesero valida el mensaje)
