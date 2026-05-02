# Feature: QR Check-in (Registro Presencial)

> **Estado:** Completo (UI + API + Servicios)
> **Archivos clave:** `src/app/(public)/check-in/page.tsx`, `src/app/api/check-in/route.ts`, `src/services/customer.service.ts`
> **Dependencias:** @supabase/supabase-js, twilio (server-side)

---

## Descripción
Ruta pública (`/check-in`) a la que los clientes acceden escaneando un código QR físico en las mesas del restaurante. Permite registrar visitas y clientes nuevos ingresando solo su número de celular.

## Objetivo
Registrar y fidelizar clientes presenciales de forma rápida (solo celular) con bienvenida automatizada y sistema de recompensas por visitas.

## Modelo de Datos
Tablas involucradas (detalle completo en `DB_SCHEMA.md`):
- **customers** — Datos del cliente (phone, name, birthday, total_visits, last_visit_at)
- **visits** — Registro individual de cada visita (customer_id, source='qr')
- **rewards** — Configuración de metas de visitas y recompensas

## Flujo de Uso

### Cliente Nuevo
1. El cliente escanea el QR en la mesa → abre `/check-in`
2. Ingresa su número de celular (10 dígitos, formato colombiano 3XXXXXXXXX)
3. El sistema busca el número en `customers`
4. **No encontrado** → Se muestran campos adicionales: Nombre y Fecha de Nacimiento
5. El cliente llena y envía el formulario
6. El sistema crea el registro en `customers` con `total_visits = 1`
7. Se crea un registro en `visits` con `source = 'qr'`
8. Se dispara un mensaje de WhatsApp de bienvenida vía Twilio (server-side)
9. Se muestra pantalla de éxito: "¡Bienvenido! Te hemos enviado un mensaje de WhatsApp"

### Cliente Existente
1. El cliente escanea el QR → abre `/check-in`
2. Ingresa su número de celular
3. El sistema busca el número en `customers`
4. **Encontrado** → Se suma +1 a `total_visits`, se actualiza `last_visit_at`
5. Se crea un registro en `visits` con `source = 'qr'`
6. Se evalúa si `total_visits` coincide con algún `visit_milestone` en `rewards`
7. Si hay recompensa → Se envía WhatsApp de recompensa vía Twilio
8. Se muestra pantalla de éxito: "¡Bienvenido de vuelta, [Nombre]! Visita #X"

## Componentes / Archivos
| Archivo | Responsabilidad |
|---------|----------------|
| `src/app/(public)/check-in/page.tsx` | Página principal del check-in (UI) |
| `src/components/features/check-in/CheckInForm.tsx` | Formulario de check-in (lógica del form) |
| `src/components/features/check-in/CheckInForm.types.ts` | Tipos del formulario |
| `src/components/features/check-in/CheckInSuccess.tsx` | Pantalla de éxito post check-in |
| `src/components/features/check-in/CheckInSuccess.types.ts` | Tipos de pantalla de éxito |
| `src/app/api/check-in/route.ts` | API Route: buscar/crear cliente + registrar visita |
| `src/services/customer.service.ts` | Lógica de negocio: CRUD de clientes |
| `src/services/visit.service.ts` | Lógica de negocio: registrar visitas |
| `src/services/whatsapp.service.ts` | Envío de mensajes WhatsApp vía Twilio |
| `src/lib/validators/phone.ts` | Validación de formato de celular colombiano |

## API / Endpoints
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/check-in` | Buscar cliente por teléfono, crear si nuevo, registrar visita, evaluar recompensa |

### POST /api/check-in

**Request Body (buscar):**
```json
{ "phone": "3001234567", "action": "lookup" }
```

**Response 200 (encontrado):**
```json
{ "found": true, "customer": { "name": "Juan", "total_visits": 4 } }
```

**Response 200 (no encontrado):**
```json
{ "found": false }
```

**Request Body (registrar):**
```json
{ "phone": "3001234567", "action": "register", "name": "Juan Pérez", "birthday": "1990-05-15" }
```

**Response 201 (nuevo):**
```json
{ "message": "welcome", "customer": { "name": "Juan Pérez", "total_visits": 1 } }
```

**Request Body (check-in existente):**
```json
{ "phone": "3001234567", "action": "checkin" }
```

**Response 200 (check-in):**
```json
{ "message": "welcome_back", "customer": { "name": "Juan", "total_visits": 5 }, "reward": { "title": "Postre gratis", "message": "¡Felicidades! ..." } }
```

## UI / Pantallas

### Pantalla 1: Ingreso de celular
- Input grande centrado para número de celular
- Teclado numérico (inputMode="numeric")
- Botón "Continuar"
- Branding del restaurante (logo, colores)

### Pantalla 2: Registro (solo clientes nuevos)
- Campos: Nombre, Fecha de Nacimiento
- Botón "Registrarme"

### Pantalla 3: Éxito
- Mensaje personalizado (bienvenida o bienvenido de vuelta)
- Nombre del cliente y número de visita
- Si hay recompensa: mostrar tarjeta con la recompensa
- Mensaje de WhatsApp enviado (confirmación)

## Restricciones
- El número de celular debe ser formato colombiano (10 dígitos, empieza con 3)
- La ruta `/check-in` es 100% pública (NO requiere auth)
- Los mensajes de WhatsApp se envían server-side (API Route) — NUNCA desde el cliente
- Si Twilio falla, el check-in se completa igual (el WhatsApp es best-effort)
- No se permiten check-ins duplicados en un periodo de 1 hora (mismo teléfono)

## Pendiente
- [x] Implementar UI del formulario
- [x] Implementar API Route
- [x] Implementar servicios (customer, visit, whatsapp, reward)
- [x] Crear migración SQL
- [ ] Configurar Twilio para envío real (requiere credenciales)
- [ ] Ejecutar migración SQL en Supabase
- [ ] Testing E2E con Supabase real
