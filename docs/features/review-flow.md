# Feature: Flujo de Solicitud de Reseñas Google (Review UX)

**Última actualización:** 2026-06-13 (v1.5.0 — Propuesta Modal Sticky Obligatorio)

---

## Objetivo

Maximizar la conversión de reseñas en Google Maps tras el check-in, eliminando el cierre instintivo del usuario y ofreciendo un incentivo tangible (puntos) por el click al link de reseña.

---

## Problema

### Problema del diseño v1.0 (GoogleReviewPopup — ya deprecado)
- Era un **modal con overlay y botón X** → los usuarios lo cerraban instintivamente ("instinct close").
- Las **estrellas eran el elemento dominante** → los usuarios creían que al tocar 5 estrellas ya habían dejado la reseña en Google.
- El **botón de Google estaba deshabilitado** hasta elegir estrellas → fricción extra y CTA ignorado.

### Problema del diseño v1.4 (GoogleReviewCard — actual)
- Aunque se eliminó el modal y se pasó a una **card inline**, los usuarios siguen ignorando la solicitud.
- La card aparece entre otros elementos (puntos, tiers, roadmap) y compite por atención.
- **No hay tracking** de quién hizo click en el link vs quién simplemente pasó de largo.
- **No hay incentivo explícito** que empuje al usuario a tomar la acción.

---

## Solución propuesta (v1.5.0 — Modal Sticky Obligatorio)

### Principio de diseño
Forzar la lectura consciente. El usuario debe tomar una decisión activa para salir de la interfaz. No puede descartarla por pura intuición.

### Especificaciones del modal

| Aspecto | Implementación |
|---------|----------------|
| **Tipo** | Modal grande, centrado, con overlay oscuro. Ocupa la mayor parte de la pantalla en mobile. |
| **Cierre** | **NO hay botón X**. No hay "click fuera para cerrar". No hay escape por intuición. |
| **Única salida negativa** | Botón de texto plano debajo del CTA: **"No quiero dejar reseña"**. Requiere decisión consciente. |
| **CTA principal** | Botón grande, color primario: **"Dejarnos una reseña — Valoramos mucho tu opinión"**. |
| **Incentivo** | Copy prominente encima o dentro del CTA: **"Obtené 20 puntos que te acercan más rápido a tu recompensa"**. |
| **Dismiss automático** | El modal se elimina/visualmente desaparece cuando el usuario toca el CTA (se abre Google Maps en nueva pestaña). |
| **Timing** | Aparece **inmediatamente** tras el check-in exitoso, bloqueando el resto de la pantalla de éxito. El contenido del check-in (puntos, tiers) queda visible pero atenuado/oscurecido detrás del overlay. |

### Trackeo de interacciones

Se debe registrar en la base de datos, vinculado al `customer_id` y a la `visit_id` actual:

| Evento | Tracking |
|--------|----------|
| **Click en CTA "Dejar reseña"** | Registra `review_link_clicked_at` + `review_link_clicked = true`. Se otorgan **20 puntos** al cliente inmediatamente. |
| **Click en "No quiero dejar reseña"** | Registra `review_declined_at` + `review_declined = true`. No se otorgan puntos. |
| **No interacción** | Si el usuario abandona la página sin tocar ningún botón, queda como `null` (se puede volver a mostrar en la próxima visita). |

### Lógica de recompensa
- Al tocar el CTA del link de Google: **+20 puntos** se suman al `total_points` del cliente, se crea un registro en `point_transactions` con `type='review_bonus'`.
- El modal solo se muestra si el cliente **no ha tocado el CTA en visitas anteriores** (evitar spam de puntos). Si en el pasado tocó "No quiero", se puede volver a mostrar después de N visitas (configurable, default: 3 visitas).

### Mensaje/copy propuesto

**Título:**
> ¡Tu opinión nos ayuda a crecer!

**Subtítulo:**
> Dejanos una reseña en Google y obtené **20 puntos extra** que te acercan a tu próxima recompensa.

**CTA principal:**
> 🚀 Ir a Google Maps — Obtener 20 puntos

**CTA negativo (salida):**
> No quiero dejar reseña

---

## Schema de DB (propuesta)

Extender la tabla `visits` con:

```sql
ALTER TABLE visits ADD COLUMN IF NOT EXISTS review_link_clicked BOOLEAN DEFAULT FALSE;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS review_link_clicked_at TIMESTAMPTZ;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS review_declined BOOLEAN DEFAULT FALSE;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS review_declined_at TIMESTAMPTZ;
```

O crear tabla dedicada `customer_review_interactions`:

```sql
CREATE TABLE customer_review_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('clicked_link', 'declined')),
  points_awarded INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Env vars

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL` | URL destino del CTA (página de reseñas de Google Maps del negocio) |

---

## Archivos Involucrados (actuales + propuestos)

| Archivo | Estado | Responsabilidad |
|---------|--------|----------------|
| `src/components/features/check-in/GoogleReviewCard.tsx` | 🔄 REFACTOR | Convertir de card inline a **modal sticky obligatorio**. Eliminar rating interno. Agregar botón "No quiero". Agregar copy de 20 puntos. |
| `src/components/features/check-in/CheckInSuccess.tsx` | 🔄 REFACTOR | Cambiar lógica de `showReview` de timer 2.5s a **inmediato + bloqueante**. No mostrar card inline, sino montar el modal encima. |
| `src/components/features/check-in/GoogleReviewPopup.tsx` | 🗑️ ELIMINAR | Código obsoleto, ya no se usa. |
| `src/app/api/check-in/review-click/route.ts` | ➕ NUEVO | Endpoint POST para registrar click/decline y otorgar puntos. |
| `src/services/review.service.ts` | ➕ NUEVO | Lógica de negocio: registrar interacción, validar si ya se otorgaron puntos, sumar puntos al cliente. |

---

## Pendientes / Roadmap

- [ ] Diseñar e implementar el nuevo modal sticky (sin X, con CTA dual).
- [ ] Crear endpoint `/api/check-in/review-click` para trackeo + otorgamiento de puntos.
- [ ] Actualizar `CheckInSuccess` para montar el modal de forma bloqueante inmediatamente.
- [ ] Agregar lógica de "no volver a mostrar si ya ganó puntos en el pasado".
- [ ] Agregar lógica de "reintentar después de N visitas si el usuario declinó".
- [ ] Eliminar `GoogleReviewPopup.tsx` y limpiar código muerto.
- [ ] Documentar en `DB_SCHEMA.md` la nueva tabla/columnas.
- [ ] Actualizar `API_DOCS.md` con el nuevo endpoint.
- [ ] Agregar entrada en `CHANGELOG.md`.
