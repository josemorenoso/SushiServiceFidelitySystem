# Feature: Flujo de Solicitud de Reseñas Google (Review UX)

**Última actualización:** 2026-06-10 (v1.4.0 — Rediseño Req P1.2)

---

## Objetivo

Maximizar la conversión de reseñas en Google Maps tras el check-in, eliminando la confusión entre el rating interno y la reseña real de Google.

---

## Problema del diseño anterior (GoogleReviewPopup — deprecado)

- Era un **modal con overlay y botón X** → los usuarios lo cerraban instintivamente ("instinct close").
- Las **estrellas eran el elemento dominante** → los usuarios creían que al tocar 5 estrellas ya habían dejado la reseña en Google.
- El **botón de Google estaba deshabilitado** hasta elegir estrellas → fricción extra y CTA ignorado.

---

## Diseño actual (GoogleReviewCard — v1.4.0)

**Archivo:** `src/components/features/check-in/GoogleReviewCard.tsx`

| Decisión | Implementación |
|----------|----------------|
| Sin modal | Card **inline** dentro de `CheckInSuccess`, aparece a los 2.5s con animación suave. No hay overlay ni botón X → no hay "instinct close". |
| CTA primero y siempre habilitado | Botón principal "Escribir mi reseña en Google" sin condiciones. Microcopy debajo: "Al tocar el botón se abre Google Maps — ahí escribes tu reseña". |
| Rating interno separado | Va DEBAJO del CTA, en sección visualmente distinta (fondo gris, borde punteado), etiquetado "Calificación rápida interna (opcional)" con disclaimer "Esto NO es la reseña de Google". |
| Confirmación post-clic | Al tocar el CTA, se reemplaza por mensaje verde "¡Gracias! Termina tu reseña en Google Maps" (refuerza que el paso final es en Google). |
| Personalización | Copy distinto para cliente nuevo vs. recurrente (usa `totalVisits`). |

**Flujo:**
```
Check-in exitoso → CheckInSuccess
  → 2.5s después → GoogleReviewCard aparece inline (entre el mensaje WhatsApp y el botón "Nuevo check-in")
  → Usuario toca CTA → window.open(NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL) → estado "gracias"
  → Rating interno (opcional): solo estado local, feedback visual, no llama API
```

---

## Env vars

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL` | URL destino del CTA (página de reseñas de Google Maps del negocio) |

---

## Archivos Involucrados

| Archivo | Responsabilidad |
|---------|----------------|
| `src/components/features/check-in/GoogleReviewCard.tsx` | Card inline de reseña (diseño actual) |
| `src/components/features/check-in/CheckInSuccess.tsx` | Monta la card (estado `showReview`, timer 2.5s) |
| `src/components/features/check-in/GoogleReviewPopup.tsx` | ⚠️ DEPRECADO — modal anterior, sin referencias. Candidato a eliminar. |

---

## Pendientes / Ideas futuras

- Persistir el rating interno en DB (tabla `internal_ratings`) para analytics de satisfacción.
- A/B testing del timing de aparición (2.5s vs. inmediato).
- No volver a mostrar la card si el cliente ya tocó el CTA en visitas anteriores (requiere persistencia).
