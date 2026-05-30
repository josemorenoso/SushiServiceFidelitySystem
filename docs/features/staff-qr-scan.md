# Feature: Verificación Cliente-Mesero con QR Dinámico

> **Estado:** En progreso (backend completo, frontend admin completado, app mesero completada)
> **Prioridad:** URGENTE
> **Archivos clave:** `src/components/features/check-in/CheckInForm.tsx`, `src/app/(public)/mesero/page.tsx`, `src/app/api/check-in/route.ts`, `src/app/(dashboard)/dashboard/staff/page.tsx`
> **Dependencias nuevas:** `qrcode.react` (generación QR cliente), `html5-qrcode` (escaneo mesero), `jose` (JWT para auth de meseros)

---

## RESUMEN EJECUTIVO — Qué queremos hacer

El dueño del restaurante quiere **evitar estafas y abusos** al sistema de fidelización. Hoy cualquier persona puede escanear el QR desde su casa, ingresar el número de un cliente y sumarle visitas/puntos sin estar físicamente en el local.

La solución es un **sistema de verificación presencial con QR dinámico** donde solo un **mesero autenticado** puede registrar visitas escaneando el QR del cliente.

**Reglas del sistema:**
- **Nadie** puede auto-asignarse visitas.
- **Cliente nuevo:** se registra → welcome bonus + visita 1 → ve QR para mesero (para futuras visitas).
- **Cliente frecuente:** ingresa celular → **siempre muestra QR** → mesero escanea → visita registrada.
- **Solo el mesero**, escaneando el QR del cliente con su celular/tablet autenticado, puede registrar la visita.

**Sub-opción configurable por el dueño:** `checkin_first_visit_free` determina si un cliente nuevo puede recibir su primera visita automáticamente al registrarse, o si también requiere que un mesero la valide.

---

## Descripción

Sistema de verificación presencial de dos pasos entre cliente y mesero usando códigos QR dinámicos, con un **modo de operación configurable** por el administrador del restaurante.

**Paso 1 (Cliente):** Escanea el QR estático del restaurante → ingresa su número de celular en `/check-in` → **siempre muestra su QR dinámico personal** para que el mesero lo escanee.

**Paso 2 (Mesero):** El mesero abre `/mesero` en el celular del restaurante. Hay dos formas de operar:

| Modo de uso | ¿Qué hace el mesero? | ¿Requiere PIN? | ¿Cuándo usarlo? |
|-------------|---------------------|----------------|-----------------|
| **Dispositivo de confianza** (recomendado) | Abre `/mesero` → ya está activado. Toca "Escanear QR de Cliente" directamente. | **NO** | Celular/tablet del restaurante que queda en caja. Configurado una vez por el supervisor. |
| **Login con PIN individual** | Abre `/mesero` → ingresa su número + PIN de 4-6 dígitos → toca "Escanear QR de Cliente". | **SÍ** | Mesero que usa su propio celular, o cuando el dueño quiere trazabilidad individual de quién escaneó. |

En ambos casos, al escanear el QR del cliente y confirmar, el sistema registra la visita, suma puntos, evalúa tiers y dispara el WhatsApp.

Esta feature garantiza que **solo un mesero autenticado** puede registrar visitas, eliminando fraudes de auto-checkin.

---

## Objetivo

- **Prevenir fraudes:** Que nadie pueda sumar visitas/puntos desde fuera del restaurante.
- **Trazabilidad:** Saber qué mesero registró cada visita.
- **Compatibilidad 100%:** El sistema de puntos, tiers y Mystery Box funciona igual en ambos modos.

---

## Modelo de Datos

> **Cambio de enfoque post-auditoría:** El diseño original (secciones 1-6) planteaba sin cambios de schema. El **nuevo requerimiento de app del mesero con login** (sección 14) requiere las siguientes adiciones:

| Tabla | Uso en esta feature | ¿Cambio? |
|-------|-------------------|----------|
| **customers** | Fuente de datos del cliente (phone, name, total_visits, current_tier) | Reutiliza existente |
| **visits** | Registro de la visita con `source = 'staff_scan'` + `registered_by_staff_id` | **Nueva columna** |
| **staff_users** | Meseros con login (PIN hasheado, rol, activo) | **Nueva tabla** |
| **staff_devices** | Dispositivos autorizados del restaurante (celular/tablet de caja) | **Nueva tabla** |
| **restaurant_locations** | Geolocalización del restaurante (ya implementado en v1.0.5) | Reutiliza existente |
| **point_transactions** | Transacción de puntos por la visita registrada | Reutiliza existente; source agrega `'visit_staff'` |
| **mystery_box_results** | Resultado de la caja misteria si aplica | Reutiliza existente |
| **admin_settings** | Feature flags: `checkin_mode`, `checkin_first_visit_free` | **Nuevas keys** |

> **Nota:** El QR dinámico no se almacena en la base de datos. Se genera en el frontend como **token JWT efímero firmado** (`jose`) con expiración de 5 minutos.

---

## Flujo de Uso Completo

### Paso 1: Cliente llega al restaurante

1. El cliente escanea el **QR estático del restaurante** (mismo de siempre, en mesa o entrada).
2. Abre la landing page `/check-in` en su celular.
3. Ingresa su número de celular y da "Buscar".
4. El sistema hace `POST /api/check-in` con `action: 'lookup'`.
5. **Respuesta encontrado:** El sistema muestra la pantalla de **"Tu QR"** con:
   - Un código QR grande centrado.
   - Nombre del cliente.
   - Tier actual (Bronce, Plata, Oro, BLACK).
   - Total de visitas y puntos.
   - Instrucción: "Muéstrale este QR a tu mesero".
   - **No se registra visita.** El QR es solo identificación.
6. **Respuesta no encontrado:** Flujo de registro nuevo (nombre, cumpleaños) → welcome bonus + visita 1 automática → muestra el QR personal.

### Paso 2: Mesero escanea el QR del cliente

**Escenario A: Celular del restaurante (dispositivo de confianza)**
1. El mesero abre `/mesero` en el celular del local.
2. El sistema detecta que este navegador ya está activado como **dispositivo de confianza** (token persistente guardado en localStorage, validado silenciosamente).
3. Va directo al dashboard. Toca "Escanear QR de Cliente".

**Escenario B: Celular propio del mesero (login con PIN)**
1. El mesero abre `/mesero` en su celular.
2. Ingresa su número de celular + PIN de 4-6 dígitos.
3. El sistema valida PIN y emite JWT. El mesero va al dashboard. Toca "Escanear QR de Cliente".

**Paso común (ambos escenarios):**
4. La página solicita permiso de cámara y muestra el visor de escaneo (`html5-qrcode`).
5. El mesero apunta su cámara al QR del cliente.
6. El sistema extrae del QR un **token efímero firmado** (`jose`) que contiene `phone`, `name`, `customer_id` y `ts` (timestamp de generación).
7. El frontend del mesero **muestra** los datos parseados pero **no valida el TTL**; la validación real ocurre en el servidor (Paso 3).
8. Muestra tarjeta de confirmación:
   - Nombre del cliente.
   - Número de celular (máscara parcial).
   - Dropdown/input para seleccionar **número de mesa**.
   - Botón "Registrar Visita".
9. El mesero selecciona mesa y confirma.

### Paso 3: Registro de visita

1. El frontend del mesero hace `POST /api/check-in` con:
   ```json
   {
     "phone": "3001234567",
     "action": "checkin",
     "source": "staff_scan",
     "table_number": "12",
     "registered_by_staff_id": "uuid-del-mesero",
     "token": "jwt-del-qr-del-cliente"
   }
   ```
2. El backend **rechaza** si `source !== 'staff_scan'` o si no hay auth válida de mesero.
3. El API route ejecuta el flujo de check-in:
   - Incrementa `total_visits`.
   - Crea registro en `visits` (source = 'staff_scan').
   - Evalúa y otorga puntos aleatorios.
   - Evalúa subida de tier.
   - Ejecuta lógica de Mystery Box si aplica.
   - Envía mensaje WhatsApp de confirmación.
4. El mesero ve pantalla de éxito con resumen: puntos ganados, tier, recompensa si aplica.

---

## Componentes / Archivos (planificados)

| Archivo | Responsabilidad |
|---------|----------------|
| `src/components/features/check-in/CheckInForm.tsx` | **MODIFICAR** — Post-lookup, siempre mostrar QR dinámico del cliente. Nunca auto-registrar visita. |
| `src/components/features/staff/StaffScanner.tsx` | **CREAR** — Componente de escaneo QR con `html5-qrcode`. |
| `src/components/features/staff/StaffScanner.types.ts` | **CREAR** — Tipos del escáner. |
| `src/components/features/staff/StaffConfirmation.tsx` | **CREAR** — Tarjeta de confirmación post-escaneo (datos cliente + input mesa). |
| `src/components/features/staff/StaffSuccess.tsx` | **CREAR** — Pantalla de éxito tras registrar visita desde staff. |
| `src/app/(public)/mesero/page.tsx` | **CREAR** — Login del mesero (PIN). |
| `src/app/(public)/mesero/dashboard/page.tsx` | **CREAR** — Dashboard post-login (stats + botón escanear). |
| `src/app/(public)/mesero/scan/page.tsx` | **CREAR** — Visor de cámara (`html5-qrcode`). |
| `src/app/(public)/mesero/confirm/page.tsx` | **CREAR** — Confirmación post-escaneo + input mesa. |
| `src/app/api/check-in/route.ts` | **MODIFICAR** — Aceptar `source: 'staff_scan'` y `registered_by_staff_id`. Saltar validación de geolocalización cuando source sea staff_scan. Rechazar check-in de existentes en modo `staff_verified` si no viene `registered_by_staff_id` de un mesero activo. |
| `src/app/api/staff/login/route.ts` | **CREAR** — Login con phone + PIN → JWT firmado con secret propio. |
| `src/app/api/staff/me/route.ts` | **CREAR** — Datos del mesero autenticado (valida JWT). |
| `src/app/api/staff/stats/route.ts` | **CREAR** — Visitas registradas hoy por el mesero autenticado. |
| `src/app/api/dashboard/staff/route.ts` | **CREAR** — CRUD de meseros para el admin (crear, listar, toggle activo, resetear PIN). |
| `src/lib/utils/qrcode.ts` | **CREAR** — Helper para generar token efímero firmado (`jose`) que codifica los datos del QR dinámico. |

---

## API / Endpoints

### POST /api/check-in (modificación)

**Body extendido (nuevos campos opcionales):**
```json
{
  "phone": "3001234567",
  "action": "checkin",
  "source": "staff_scan",
  "registered_by_staff_id": "uuid-del-mesero",
  "table_number": "12"
}
```

**Comportamiento por `source`:**
| source | Requiere staff auth | Comportamiento |
|--------|-------------------|----------------|
| `"staff_scan"` | **SÍ** | El mesero escanea QR del cliente y confirma. Requiere `registered_by_staff_id` activo O `device_token` de confianza. Valida firma del QR token. |
| Cualquier otro | — | **Rechazado con 403.** Nadie excepto un mesero autenticado puede registrar visitas. |

> **Validación:** El backend siempre rechaza `action: 'checkin'` si `source !== 'staff_scan'` o si no hay autenticación válida de mesero (staff_id activo o device_token de confianza).

> **Razón:** El mesero está físicamente en el restaurante. La validación de presencia la hace el mesero autenticado al escanear el QR del cliente frente a él.

---

## UI / Pantallas

### Pantalla del Cliente — "Tu QR" (post-lookup en CheckInForm)

- QR grande centrado (generado con `qrcode.react`).
- Encabezado: "¡Hola, [Nombre]!"
- Subtítulo: "Muéstrale este código a tu mesero"
- Datos del cliente: Tier, visitas totales, puntos actuales.
- Instrucciones breves en texto.
- Diseño optimizado para pantallas pequeñas (celular del cliente).

**Contenido del QR (token efímero firmado):**
El QR no expone datos crudos del cliente. En su lugar codifica un **JWT corto y efímero** firmado con `jose` usando un secret exclusivo del servidor (`STAFF_QR_JWT_SECRET`):
```
https://[dominio]/mesero/scan?token=eyJhbGciOiJIUzI1Ni...
```
- Payload del token: `{ sub: customer_id, phone, name, ts: 1716912000, exp: 1716912300 }`
- `ts` (timestamp de generación) + `exp` (expiración en 5 minutos) para evitar reutilización de screenshots antiguas.
- **Validación:** El backend (`/api/check-in`) verifica la firma y la expiración del token. El frontend del mesero solo parsea el payload para mostrar datos preliminares.
- **Por qué no usar datos crudos:** Evita que un atacante genere QRs falsos conociendo números de clientes o que robe `customer_id` visibles.

### Pantalla del Mesero — Escáner (`/mesero/scan`)

- Requiere sesión de mesero válida (JWT). Si no hay sesión, redirige a `/mesero`.
- Pantalla completa con visor de cámara (`html5-qrcode`).
- Overlay con marco de escaneo (diseño tipo "cámara de pago").
- Botón para encender/apagar linterna (si el navegador lo permite).
- Mensaje guía: "Apunta al código QR del cliente".
- Fallback: input manual de número de celular si la cámara falla (valida contra `/api/check-in` con `source: 'staff_scan'`).

### Pantalla del Mesero — Confirmación

- Tarjeta con foto/avatar genérico del cliente.
- Nombre completo.
- Número de celular enmascarado (ej: `300••••567`).
- Input de número de mesa (obligatorio).
- Botón "Registrar Visita" (primario, grande).
- Botón "Cancelar / Escanear otro" (secundario).

### Pantalla del Mesero — Éxito

- Ícono de éxito + animación breve.
- Resumen: "Visita registrada para [Nombre]".
- Puntos otorgados (si aplica).
- Tier actual del cliente.
- Botón "Escanear siguiente cliente".

---

## Multi-Tenancy — Varios Clientes Activos (Modelo Clone-por-Cliente)

Este proyecto opera bajo **ADR-005: Modelo clone-por-cliente** (ver `docs/02-architecture.md`).

### ¿Cómo afecta esta feature a múltiples restaurantes?

**No afecta la arquitectura multi-tenant.** La feature es 100% local al deploy de cada restaurante:

| Aspecto | Compatibilidad | Notas |
|---------|---------------|-------|
| **Base de datos** | ✅ Aislada | Cada restaurante tiene su propio proyecto Supabase. Los datos de clientes no se comparten. |
| **QR del restaurante** | ✅ Único por deploy | El QR estático de cada restaurante apunta a su propio dominio de Vercel (`restaurante-a.vercel.app/check-in`). |
| **QR del cliente** | ✅ Generado en runtime | No hay URLs hardcodeadas. El QR usa el dominio actual (`window.location.origin`). |
| **Página `/mesero`** | ✅ Aislada | Cada deploy tiene su propia `/mesero`. Los meseros de un restaurante no ven datos de otro. |
| **Dependencias** | ✅ Idénticas | `qrcode.react` y `html5-qrcode` se instalan en el repo plantilla y se clonan a cada cliente. |
| **Configuración** | ✅ Requiere secrets nuevos | Necesita `STAFF_JWT_SECRET` y `STAFF_QR_JWT_SECRET` en Vercel. Migración SQL requerida para `staff_users`.

### Proceso de rollout a N clientes

1. Implementar en el **repo plantilla** (este repo).
2. Hacer commit + push a `main`.
3. Para cada cliente existente:
   - `git pull` en su repo clonado.
   - `npm install` (instala nuevas dependencias).
   - Re-deploy en Vercel (automático si tiene Git integration).
4. Cada cliente recibe la feature de forma aislada. Requiere ejecutar la migración SQL correspondiente en su proyecto Supabase.

> **Consecuencia:** Esta feature es "plug & play" para todos los restaurantes que usen esta plantilla. No requiere acciones especiales por cliente.

---

## Restricciones

- La ruta `/mesero` tiene **dos modos de acceso**:
  - **Dispositivo de confianza:** El navegador presenta un `device_token` persistente (localStorage) validado silenciosamente por el backend. No requiere PIN. Ideal para el celular/tablet del restaurante.
  - **Login con PIN:** Sub-rutas `/mesero/dashboard`, `/mesero/scan` y `/mesero/confirm` requieren JWT de mesero válido (emitido tras validar PIN).
- El QR dinámico del cliente debe tener un **tiempo de vida corto** (ej: 5 minutos) para evitar reutilización de screenshots antiguas. La validación del TTL (`ts`) se hace **obligatoriamente en el servidor** (`/api/check-in`), nunca solo en el frontend del mesero.
- Si el cliente no tiene cámara o no quiere usarla, el mesero puede usar el **modo manual**: escribir el número de celular del cliente en un input y confirmar (el backend valida duplicados igual que con QR).
- La validación de geolocalización del cliente se **salta** cuando `source = 'staff_scan'`.
- El campo `table_number` es opcional (para analytics futuros).
- Los mensajes de WhatsApp se envían **server-side** igual que antes — el cliente recibe confirmación de puntos/recompensa.

---

## Dependencias Nuevas

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `qrcode.react` | `^4.x` | Generar QR dinámico en el frontend del cliente (`<QRCodeCanvas />`). |
| `html5-qrcode` | `^2.x` | Leer QR con la cámara del celular del mesero. |

> Ambas son librerías livianas, sin dependencias pesadas. No requieren configuración especial.

---

## Plan de Implementación (Pasos)

### Fase 1: Instalación de dependencias
1. `npm install qrcode.react html5-qrcode jose bcryptjs`
2. Actualizar `package.json` (ya lo hace npm).
3. Agregar a `.env.example`: `STAFF_JWT_SECRET` y `STAFF_QR_JWT_SECRET`.
4. Verificar que el build compila sin errores.

### Fase 1.5: Dispositivo de confianza (configuración del local)
1. Supervisor abre `/mesero/activate` en el celular/tablet del restaurante.
2. Ingresa su número de celular + PIN de supervisor.
3. POST `/api/staff/device/register` → backend genera `device_token` de 90 días.
4. Guardar `device_token` en localStorage del navegador.
5. Redirigir a `/mesero/dashboard`. Desde ese momento el dispositivo está listo.

### Fase 2: Generación del QR dinámico del cliente
4. En `CheckInForm.tsx`, tras `action: 'lookup'` exitoso:
   - Mostrar nueva pantalla/estado `showCustomerQR`.
   - Generar **token JWT efímero** (`jose`) con payload `{sub: customer_id, phone, name, ts, exp}` usando `STAFF_QR_JWT_SECRET`.
   - Renderizar `<QRCodeCanvas value={qrUrlConToken} size={256} />`.
   - Mostrar datos del cliente (nombre, tier, visitas).
5. Asegurar diseño responsive para celulares del cliente.
6. El QR codifica una URL con token firmado (`/mesero/scan?token=...`), nunca datos crudos del cliente.

### Fase 3: Página de escaneo para el mesero (`/mesero/scan`)
7. Crear `src/app/(public)/mesero/scan/page.tsx`.
8. Crear componente `StaffScanner.tsx` con `html5-qrcode`:
   - Inicializar escáner al montar.
   - Manejar permisos de cámara.
   - Fallback a input manual si no hay cámara.
9. Al escanear exitosamente:
   - Parsear token del QR (decodificar payload con `jose` sin verificar secret para mostrar datos preliminares).
   - Mostrar `StaffConfirmation.tsx` con datos del cliente.
   - La validación real de firma y expiración del token ocurre en el servidor (`/api/check-in`).

### Fase 4: Confirmación y registro
10. En `StaffConfirmation.tsx`:
    - Mostrar datos del cliente parseados del QR.
    - Input para número de mesa (requerido).
    - Botón "Registrar Visita" → POST a `/api/check-in`.
11. Crear `StaffSuccess.tsx` para pantalla post-registro.

### Fase 5: Ajuste del API check-in
12. En `/api/check-in/route.ts`:
    - Extender `CheckInRequestBody` con `source?: 'qr' | 'staff_scan'`, `registered_by_staff_id?: string`, `token?: string`.
    - Si `source === 'staff_scan'`: omitir validación de geolocalización; validar `registered_by_staff_id` activo y `token` (firma + expiración).
    - En modo `staff_verified`, rechazar check-in de cliente existente sin staff_id válido (403).
    - Guardar `table_number` en `visits` (ya existe, migración 00009).
    - Resto del flujo (puntos, tiers, Mystery Box, WhatsApp) sin cambios.

### Fase 6: Documentación
13. Actualizar `docs/API_DOCS.md` con el nuevo comportamiento de `/api/check-in`.
14. Actualizar `docs/DB_SCHEMA.md` con `staff_users`, `registered_by_staff_id`, nuevos settings y RLS.
15. Actualizar `docs/02-architecture.md` (Tabla de Lookup) con nuevos archivos.
16. Agregar entrada en `CHANGELOG.md`.
17. Actualizar este archivo `docs/features/staff-qr-scan.md` con estado COMPLETED.

### Fase 7: Validación
18. `npm run build` sin errores.
19. Probar flujo completo localmente:
    - **Dispositivo de confianza:** Supervisor activa tablet → mesero abre `/mesero` → va directo a dashboard → escanea QR → visita confirmada.
    - **Login con PIN:** Mesero abre `/mesero` → login con PIN → escanea QR → registra mesa → visita confirmada.
    - Cliente escanea → ingresa celular → ve QR.
20. Verificar que el flujo QR original (`/check-in` sin mesero) sigue funcionando.

---

## Pendiente

- [ ] Instalar dependencias `qrcode.react`, `html5-qrcode`, `jose`, `bcryptjs`
- [ ] Implementar generación de QR dinámico en `CheckInForm.tsx`
- [ ] Crear rutas `/mesero/*` y componentes de escaneo/login/activación
- [ ] Crear API `/api/staff/device/register` y `/api/staff/device/verify`
- [ ] Modificar `/api/check-in/route.ts` para `source: 'staff_scan'`, `registered_by_staff_id`, `device_token`, `token`
- [ ] Actualizar `docs/API_DOCS.md`
- [ ] Actualizar `docs/DB_SCHEMA.md` (si hay cambio de schema)
- [ ] Actualizar `CHANGELOG.md`
- [ ] Build + validación E2E

---

## Modo de Check-in Configurable

### Feature Flags

En `admin_settings` se agregan nuevas keys controlables desde **Dashboard > Ajustes > Sistema de Check-in**:

| Key | Tipo | Valores | Default | Descripción |
|-----|------|---------|---------|-------------|
| `checkin_mode` | `text` | `'auto'` \| `'staff_verified'` | `'auto'` | Modo de operación del check-in |
| `checkin_first_visit_free` | `text` | `'true'` \| `'false'` | `'true'` | Si en modo `staff_verified` la primera visita de un cliente nuevo es automática (bienvenida) o también requiere mesero |

El dueño puede cambiar esto en cualquier momento sin redeploy.

### Flujo de check-in

El check-in siempre requiere un mesero autenticado para registrar visitas. El QR del cliente es solo identificación.

```
CLIENTE NUEVO (total_visits = 0)
  → Escanea QR → /check-in → Registro → +1 visita automática (bienvenida) + welcome bonus
  → Muestra pantalla de éxito con puntos
  → WhatsApp de bienvenida
  → Luego muestra QR dinámico (para futuras visitas)

CLIENTE EXISTENTE (total_visits ≥ 1)
  → Escanea QR → /check-in → Ingresa celular
  → NO se registra visita
  → El frontend muestra QR DINÁMICO personal (token firmado con jose)
  → Mensaje: "Muéstrale este QR a tu mesero"

MESERO — Escenario A: Dispositivo de confianza (celular del local)
  → Abre /mesero en el celular del restaurante
  → El navegador ya tiene device_token activo → va DIRECTO al dashboard
  → Toca "Escanear QR de Cliente" → abre cámara
  → Escanea QR del cliente
  → POST /api/check-in con source: 'staff_scan', device_token: xxx
  → Backend valida token del QR + device_token activo
  → Sistema registra visita, otorga puntos, evalúa tier
  → Mesero ve éxito → Cliente recibe WhatsApp

MESERO — Escenario B: Celular propio (login con PIN)
  → Abre /mesero en su celular
  → Login con PIN (phone + PIN de 4-6 dígitos) → JWT en localStorage
  → Dashboard → Toca "Escanear QR" → escanea
  → POST /api/check-in con source: 'staff_scan', registered_by_staff_id: uuid-del-mesero
  → Backend valida token del QR + staff_id activo
  → Sistema registra visita, otorga puntos, evalúa tier
  → Mesero ve éxito → Cliente recibe WhatsApp
```

**Sub-opción configurable: "Primera visita libre"** (`checkin_first_visit_free`)
- **`'true'` (default):** Cliente nuevo recibe visita 1 automáticamente al registrarse. Frecuentes requieren mesero.
- **`'false'`:** Incluso la primera visita requiere mesero. Más seguro, más fricción.

### Lógica del frontend del cliente

```
POST /api/check-in { action: 'lookup', phone }
  → Recibe { found, customer, current_tier } del servidor

Si encontrado (cliente existente):
  → Genera QR dinámico como token JWT firmado (phone + customer_id + timestamp + exp)
  → Muestra pantalla "Muéstrale este QR a tu mesero"
  → NO hace auto-check-in (solo mesero puede registrar visita)

Si no encontrado (cliente nuevo):
  → Muestra formulario de registro
  → Tras registro: welcome bonus + visita 1 + QR dinámico
```

### Lógica del backend

```
POST /api/check-in { action: 'checkin', phone, source, registered_by_staff_id?, device_token?, table_number?, token? }

1. Buscar cliente por phone
2. Rechazar si source !== 'staff_scan':
   → 403: "Solo un mesero puede registrar visitas."
3. Validar autenticación del mesero:
   - Si viene registered_by_staff_id: validar que exista y esté activo en staff_users
   - Si viene device_token: validar que exista y esté activo en staff_devices
   - Si NO viene ninguno → RECHAZAR 403
     "Mesero o dispositivo no válido."
4. Si viene token (QR dinámico del cliente): validar firma y expiración con STAFF_QR_JWT_SECRET
5. Marcar visita con source: 'staff_scan'
6. Guardar registered_by_staff_id en visits (null si fue por device trust)
7. Flujo de puntos, tiers, WhatsApp (idéntico)
   Nota: awardVisitPoints acepta source 'staff_scan' y mapea a tx_source 'visit_staff'
```

### Tabla de comportamiento por configuración

| Escenario | `checkin_first_visit_free = true` (default) | `checkin_first_visit_free = false` |
|-----------|---------------------------------------------|-------------------------------------|
| Cliente nuevo | Registro → +1 visita + welcome bonus → QR | Registro → solo welcome bonus → QR |
| Cliente existente | QR → mesero escanea → visita registrada | QR → mesero escanea → visita registrada |
| Primera visita | Automática (welcome) | Requiere mesero |
| Puntos frecuente | Cuando el mesero escanea | Cuando el mesero escanea |
| WhatsApp | Cuando el mesero escanea | Cuando el mesero escanea |
| Anti-fraude | Rate limit + QR TTL + device trust/PIN + traza | Rate limit + QR TTL + device trust/PIN + traza |
| Fricción cliente | Media | Alta |
| Fricción mesero | **Casi cero** (device trust) | **Casi cero** (device trust) |

---

## Mini QR para Domicilio — Captación Anti-Rappi / Anti-Didi

> **Idea del dueño:** Pegar un mini QR del restaurante en cada caja de domicilio. El cliente que recibe su pedido escanea el QR, se registra en el sistema de fidelización y empieza a acumular puntos. La próxima vez pedirá directo al restaurante en vez de por Rappi o Didi.

### ¿Por qué funciona?

Rappi y Didi **no dan fidelización** a los restaurantes. El cliente pedía por la app, comía, y el restaurante nunca supo quién era. Con un QR en la caja:

1. El restaurante **captura el número y nombre** del cliente.
2. El cliente entra al **sistema de puntos y tiers** del restaurante.
3. El restaurante le puede escribir por **WhatsApp** con promos, recompensas y eventos.
4. El cliente, viendo que acumula puntos y premios, **pide directo** la próxima vez.

### ¿Por qué no hay riesgo de reescaneo?

Con el modo `staff_verified` activo:

| Escenario | Qué pasa al escanear el QR de la caja | ¿Suma visita? |
|-----------|--------------------------------------|---------------|
| **Cliente nuevo** | Se registra → +1 visita (bienvenida) + puntos de bienvenida → recibe WhatsApp | **Sí, una sola vez** |
| **Cliente existente (1ª vez con este QR)** | Ingresa celular → sistema le muestra su **QR dinámico personal** → mensaje: "Muéstrale este QR a tu mesero" | **No** (necesita mesero) |
| **Cliente existente (reescanea el mismo QR meses después)** | Mismo resultado: solo ve su QR dinámico. Sin mesero = sin visita. | **No** |

El QR de la caja es el **mismo QR estático** del restaurante (`/check-in`). No necesita ser único por caja. La protección viene del modo `staff_verified`: un cliente registrado nunca puede auto-sumar visitas, solo puede mostrar su QR a un mesero con login.

### Flujo del cliente de domicilio

```
CLIENTE RECIBE SU DOMICILIO (de Rappi, Didi o pedido directo)
├── Ve el mini QR pegado en la caja
├── Escanea con su celular → abre /check-in
├── Ingresa su número de celular
├── Si es NUEVO:
│   ├── Llena registro (nombre, cumpleaños)
│   ├── +1 visita (bienvenida) + puntos de bienvenida
│   ├── Recibe WhatsApp: "¡Bienvenido! Ya tienes X puntos"
│   └── Ve en pantalla: "Seguí sumando puntos en tu próxima visita al local"
├── Si es EXISTENTE:
│   └── Solo ve su QR dinámico personal
│       └── Mensaje: "Muéstrale este QR a tu mesero en tu próxima visita al local"
└── El restaurante ya lo tiene en la base de datos para campañas de WhatsApp
```

### Resultado para el restaurante

| Antes (sin QR en caja) | Después (con QR en caja) |
|------------------------|--------------------------|
| Cliente pide por Rappi → come → desaparece | Cliente pide por Rappi → escanea QR → entra al CRM del restaurante |
| El restaurante no sabe quién compró | El restaurante tiene su nombre, celular y consentimiento para WhatsApp |
| El cliente vuelve a Rappi la próxima vez | El restaurante le escribe por WhatsApp con "Vení al local y sumá puntos" → el cliente va directo |
| Costo de comisión a Rappi/Didi en cada pedido | Cliente retenido → pedidos directos → sin comisión |

### Diferencia con el QR de mesa

| | QR de mesa (en el local) | Mini QR de caja (domicilio) |
|---|--------------------------|----------------------------|
| **Ubicación** | Pegado en mesas/paredes del local | Pegado en cajas de comida para llevar/domicilio |
| **Modo `staff_verified`** | Cliente existente muestra QR a mesero | Cliente existente solo ve QR dinámico (sin mesero = sin visita) |
| **Objetivo** | Fidelizar al que ya vino al local | **Captar** al que pidió por app y convertirlo en cliente directo |

### Implementación

Solo se necesita:
1. **Imprimir mini QR stickers** con la URL del `/check-in` del restaurante (ej: `tudominio.com/check-in`).
2. **Pegar uno en cada caja** que salga del restaurante, sin importar si el pedido vino por Rappi, Didi, WhatsApp o presencial para llevar.
3. El sistema ya funciona: es el mismo `/check-in` con el modo `staff_verified` activo.

> **Nota:** El modo `staff_verified` garantiza que un cliente existente nunca pueda auto-sumar visitas, solo puede mostrar su QR a un mesero con login.

---

## AUDITORIA — Estado Actual del Sistema (v1.0.x)

> Fecha de auditoría: 2026-05-29
> Archivos revisados: `check-in/route.ts`, `CheckInForm.tsx`, `CheckInForm.types.ts`, `visit.service.ts`, `authorized-numbers/page.tsx`, `DB_SCHEMA.md`

### Hallazgos

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| **Flujo actual** | Eliminado auto-checkin | `CheckInForm.tsx` ya no hace auto-checkin. Siempre genera QR dinámico para que el mesero escanee. |
| **Geolocalización** | Comentada/Standby | Código de validación GPS está comentado en `check-in/route.ts` (`@src/app/api/check-in/route.ts:108-143`). Columnas `checkin_lat/lon/distance_meters` existen en `customers` pero no se usan. |
| `visits.source` | Enum limitado | `visit.service.ts` solo acepta `'qr' | 'delivery'` (`@src/services/visit.service.ts:15`). No existe `'staff_scan'`. |
| `visits.table_number` | Ya existe | La columna `table_number` ya está en la tabla (`@docs/DB_SCHEMA.md:169`, migración `00009`). El servicio `createVisit` ya la soporta (`@src/services/visit.service.ts:21,34`). |
| Meseros en DB | Solo `authorized_numbers` | Tabla existente para validar números de WhatsApp de meseros en webhook de domicilios (`@docs/DB_SCHEMA.md:252-270`). **No hay tabla de usuarios de meseros con login/contraseña.** |
| Autenticación de staff | NO EXISTE | No hay sistema de login para meseros. No hay tabla `staff_users`, `waiter_accounts` ni similar. |
| Anti-duplicado | 30 segundos (testing) | `getRecentVisit` usa 0.5 minutos (`@src/app/api/check-in/route.ts:271`). El filtro `.eq('source', 'qr')` significa que un `staff_scan` no contaría como duplicado de un `qr` previo — esto es un bug potencial. |
| Puntos y tiers | Operativo | `awardVisitPoints`, `evaluateNewTier`, `awardWelcomeBonus` funcionan (`@src/app/api/check-in/route.ts:307-327`). |
| Mystery Box | Operativo | Resolución de tiers + envío de plantillas está implementado. |

### Gaps críticos identificados

1. **Sin validación presencial real:** Corregido. Solo un mesero autenticado puede registrar visitas.
2. **Sin autenticación de meseros:** No hay forma de saber QUÉ mesero registró la visita. No hay trazabilidad.
3. **Source `'staff_scan'` no existe:** El enum de `visits.source` y la lógica del API no lo reconocen.
4. **Duplicados por source separados:** Si un cliente hace check-in QR y luego un mesero escanea su QR, ambas cuentan como visitas distintas porque `getRecentVisit` filtra por `source = 'qr'`.
5. **Geolocación desactivada:** El mecanismo anti-scam más robusto está apagado por fricción con usuarios.

---

## NUEVO REQUERIMIENTO — App del Mesero con Login + QR Scanner

> Solicitud del dueño (2026-05-29): El mesero debe poder iniciar sesión en una app propia, tocar un botón de QR y se abre una cámara para escanear el QR del cliente.

### Cambio de enfoque respecto al diseño original

El diseño original (secciones 1-13 de este doc) planteaba `/staff` como **ruta pública sin login**. El nuevo requerimiento añade:

- **Autenticación de meseros:** Cada mesero puede tener cuenta con PIN (para trazabilidad individual).
- **Dispositivo de confianza:** El celular/tablet del restaurante se configura **una sola vez** por el supervisor y después no requiere PIN. Esto da **0 fricción** al mesero de turno.
- **Sesión persistente:** El mesero no debe loguearse en cada uso (ya sea por device trust o JWT de larga duración).
- **Apartado QR en el menú:** Dentro de la app del mesero, un botón que abre el escáner.
- **Traza de quién escaneó:** La visita registrada queda asociada al mesero (si usó PIN) o al dispositivo del restaurante (si usó device trust).

### Modelo de datos adicional (requiere migración)

```sql
-- Nueva tabla: staff_users (usuarios de meseros con login opcional)
CREATE TABLE staff_users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    phone           text NOT NULL UNIQUE,   -- para contacto/recuperación
    pin             text,                    -- hashed bcrypt (null = solo usa device trust, no login individual)
    role            text NOT NULL DEFAULT 'waiter', -- 'waiter' | 'supervisor' | 'admin'
    is_active       boolean NOT NULL DEFAULT true,
    last_login_at   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Nueva tabla: staff_devices (dispositivos de confianza del restaurante)
CREATE TABLE staff_devices (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_user_id       uuid REFERENCES staff_users(id) ON DELETE CASCADE, -- quién activó el dispositivo
    device_fingerprint  text NOT NULL, -- hash de user agent + screen res + plataforma (no identificable personalmente)
    device_name         text,          -- ej: "Tablet Caja", "Celular del Local"
    is_trusted          boolean NOT NULL DEFAULT true,
    trusted_at          timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz,   -- null = nunca expira (dispositivo del local)
    last_used_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_staff_devices_fingerprint ON staff_devices(device_fingerprint);
CREATE INDEX idx_staff_devices_staff ON staff_devices(staff_user_id);

-- Nueva FK en visits: quién registró la visita (puede ser null si fue por device trust genérico)
ALTER TABLE visits ADD COLUMN registered_by_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL;
CREATE INDEX idx_visits_registered_by ON visits(registered_by_staff_id);
```

> **Nota sobre `authorized_numbers`:** La tabla `authorized_numbers` sigue existiendo para el **webhook de domicilios** (n8n → valida que el mensaje de WhatsApp venga de un mesero autorizado). La nueva tabla `staff_users` es para **login en la app de escaneo QR**. Son dos sistemas distintos: uno valida números de WhatsApp entrantes, el otro autentica meseros en la app. Pueden (y deben) sincronizarse: al crear un `staff_user`, opcionalmente crear un `authorized_number` con el mismo teléfono.

### Flujo actualizado (con login)

```
ESCENARIO A: CELULAR DEL RESTAURANTE (DISPOSITIVO DE CONFIANZA)
├── Supervisor/Dueño abre /mesero en el celular del local
├── Toca "Activar este dispositivo" → ingresa su PIN de supervisor
├── POST /api/staff/device/register
│   └── Backend genera device_token de larga duración (90 días) → guarda en localStorage
├── Desde ese momento, cualquier mesero abre /mesero y VA DIRECTO al dashboard
│   └── El backend valida el device_token silenciosamente
├── Toca "Escanear QR" → escanea → confirma → POST /api/check-in
│   └── source: 'staff_scan', device_token: xxx (no registered_by_staff_id)
└── Pantalla de éxito

ESCENARIO B: CELULAR PROPIO DEL MESERO (LOGIN CON PIN)
├── Mesero abre /mesero en su celular
├── Ingresa su número + PIN de 4-6 dígitos
├── POST /api/staff/login
│   └── Si válido → JWT en localStorage (8 horas)
├── Dashboard del mesero → toca "Escanear QR"
├── Escanea → confirma → POST /api/check-in
│   └── source: 'staff_scan', registered_by_staff_id: uuid-del-mesero
└── Pantalla de éxito

CLIENTE (ambos escenarios)
├── Escanea QR del restaurante → /check-in
├── Ingresa celular
├── Si existe → muestra QR dinámico personal (qrcode.react)
├── Si nuevo → registro → luego muestra QR dinámico
└── "Muéstrale este QR a tu mesero"
```

### API endpoints nuevos

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `POST` | `/api/staff/login` | Login con phone + PIN → JWT firmado con `STAFF_JWT_SECRET` | Público |
| `POST` | `/api/staff/refresh` | Refresh de token JWT | Público (cookie httpOnly) |
| `GET` | `/api/staff/me` | Datos del mesero autenticado (JWT) o del dispositivo (device_token) | Bearer JWT o Device Token |
| `GET` | `/api/staff/stats` | Visitas registradas hoy (por mesero o por dispositivo) | Bearer JWT o Device Token |
| `POST` | `/api/staff/device/register` | Registrar celular/tablet del local como dispositivo de confianza (requiere PIN de supervisor) | Bearer JWT (supervisor/admin) |
| `POST` | `/api/staff/device/verify` | Verificar silenciosamente si el navegador es un dispositivo de confianza | Público (envía device_token) |
| `DELETE` | `/api/staff/device/:id` | Revocar un dispositivo de confianza | Admin JWT |
| `GET` | `/api/dashboard/staff` | Listar meseros y dispositivos del restaurante | Admin JWT |
| `POST` | `/api/dashboard/staff` | Crear mesero (name, phone, pin, role) | Admin JWT |
| `PATCH` | `/api/dashboard/staff/:id` | Actualizar mesero (toggle activo, resetear PIN) | Admin JWT |

### Cambios en endpoints existentes

| Endpoint | Cambio |
|----------|--------|
| `POST /api/check-in` | Body extendido: `source?: 'qr' | 'staff_scan'`, `staff_id?: string` (UUID del mesero autenticado, vía header o body). Cuando `source === 'staff_scan'`, omitir validación de geolocalización. |
| `visits.source` | Ampliar enum: `'qr' \| 'delivery' \| 'staff_scan'` |
| `getRecentVisit()` | **BUG FIX:** Quitar filtro `.eq('source', 'qr')` para que cualquier visita reciente (QR o staff_scan) cuente como duplicado. |

### Rutas de frontend (nuevas)

| Ruta | Descripción | Auth |
|------|-------------|------|
| `/mesero` | Login del mesero (PIN) o redirección a dashboard si es dispositivo de confianza | Sin auth (salvo verificación silenciosa de device_token) |
| `/mesero/activate` | Pantalla para activar este dispositivo como "de confianza" (requiere PIN de supervisor) | Sin auth |
| `/mesero/dashboard` | Home: estadísticas + botón escanear | Requiere JWT o Device Token válido |
| `/mesero/scan` | Cámara de escaneo QR | Requiere JWT o Device Token válido |
| `/mesero/confirm` | Confirmación post-escaneo | Requiere JWT o Device Token válido |

> **Por qué `/mesero` y no `/staff`:** `/staff` está reservado en el diseño original para la página pública de escaneo. El nuevo requerimiento con login merece un namespace distinto para no confundir con la ruta pública. Si se prefiere, `/staff` puede redirigir a `/mesero`.

### Componentes frontend (nuevos)

| Archivo | Responsabilidad |
|---------|----------------|
| `src/app/(public)/mesero/page.tsx` | Login del mesero (phone + PIN) |
| `src/app/(public)/mesero/dashboard/page.tsx` | Dashboard post-login: stats del día + botón escanear |
| `src/app/(public)/mesero/scan/page.tsx` | Visor de cámara con `html5-qrcode` |
| `src/app/(public)/mesero/confirm/page.tsx` | Tarjeta del cliente + input mesa + botón confirmar |
| `src/components/features/staff/StaffLoginForm.tsx` | Formulario de login (phone + PIN) |
| `src/components/features/staff/StaffDeviceActivation.tsx` | Pantalla para activar dispositivo de confianza (ingresa PIN supervisor) |
| `src/components/features/staff/StaffDashboard.tsx` | Stats del mesero / del día + navegación rápida |
| `src/components/features/staff/StaffScanner.tsx` | Componente de escaneo con `html5-qrcode` |
| `src/components/features/staff/StaffConfirmation.tsx` | Confirmación de datos + input mesa |
| `src/components/features/staff/StaffSuccess.tsx` | Éxito post-registro |
| `src/hooks/useStaffAuth.ts` | Hook para manejar JWT, device_token, logout, proteger rutas `/mesero/*` |

### Seguridad y anti-abuso (nuevas capas)

| Mecanismo | Implementación |
|-----------|---------------|
| **QR con TTL** | El token JWT del QR incluye `exp` (expiración en 5 min). El backend (`/api/check-in`) valida firma y expiración con `STAFF_QR_JWT_SECRET`. El frontend del mesero nunca valida el TTL. |
| **Rate limit dual** | Mantener rate limit por IP (`checkin:${ip}`) SIEMPRE como capa base. Adicionalmente, rate limit por staff (`checkin:${staffId}`) cuando source es staff_scan. |
| **PIN (no password)** | 4-6 dígitos numéricos, bcrypt hashed (requiere instalar `bcryptjs`). Fácil de recordar para meseros, seguro contra fuerza bruta con rate limit. |
| **Traza completa** | Cada visita `staff_scan` queda ligada al `staff_user` que la registró (`visits.registered_by_staff_id`) o al dispositivo (`staff_devices.id`). El admin puede auditar quién/qué escaneó a quién. |
| **Dispositivo de confianza** | El supervisor activa un dispositivo una sola vez con su PIN. El `device_token` se guarda en localStorage y se valida silenciosamente en cada request. Puede revocarse desde el dashboard del admin. |
| **Sesión corta (PIN)** | JWT expira en 8 horas (turno de trabajo). Refresh token en cookie httpOnly opcional. |
| **Inactividad** | *(Futuro / Nice-to-have)* Auto-logout tras 30 min sin actividad en la app del mesero. Complejidad alta en webapp PWA; prioridad baja respecto al core. |

### Dependencias nuevas (adicional a las del diseño original)

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `jose` | `^5.x` | Firmar/verificar JWT del mesero y del token efímero del QR (edge-compatible) |
| `bcryptjs` | `^2.x` | Hashear PIN de meseros (más ligero que bcrypt nativo, funciona en Edge) |
| `qrcode.react` | `^4.x` | Generar QR dinámico del cliente (ya estaba en diseño original) |
| `html5-qrcode` | `^2.x` | Leer QR con cámara del mesero (ya estaba en diseño original) |

### Pendiente actualizado (post-auditoría + nuevo requerimiento)

- [x] Instalar dependencias: `qrcode.react`, `html5-qrcode`, `jose`, `bcryptjs`
- [x] Crear migración SQL: tabla `staff_users`, tabla `staff_devices`, columna `visits.registered_by_staff_id`, ampliar `visits.source` enum implícito
- [x] Agregar `checkin_mode` y `checkin_first_visit_free` a seeds de `admin_settings`
- [x] Crear API `/api/staff/login`, `/api/staff/me`, `/api/staff/stats`
- [x] Crear API `/api/staff/device/register` y `/api/staff/device/verify`
- [x] Crear API `/api/dashboard/staff` — CRUD de meseros y dispositivos para admin
- [x] Modificar `POST /api/check-in`: aceptar `source: 'staff_scan'`, `registered_by_staff_id`, `device_token`, `token`; validar staff activo O device trust + token firma/exp; rechazar check-in si `source !== 'staff_scan'`
- [x] Ampliar `CheckInRequestBody`, `PointTransactionSource`, `awardVisitPoints()`, `incrementVisit()`
- [x] Fix `getRecentVisit()` — quitar filtro `.eq('source', 'qr')`
- [x] Modificar lookup para retornar `checkin_mode`, `checkin_first_visit_free`, `current_tier`
- [x] Modificar `CheckInForm.tsx` para detener auto-check-in y mostrar QR dinámico (token JWT)
- [x] Crear rutas `/mesero`, `/mesero/activate`, `/mesero/dashboard`, `/mesero/scan`, `/mesero/confirm`
- [x] Crear hook `useStaffAuth.ts` y componentes de staff (incluyendo `StaffDeviceActivation`)
- [x] Crear frontend admin `/dashboard/staff` — CRUD de meseros con PIN, toggle activo, reset PIN, dispositivos de confianza
- [ ] Agregar RLS para `staff_users` y `staff_devices`
- [ ] Actualizar `docs/DB_SCHEMA.md`, `docs/API_DOCS.md`, `docs/03-security.md`, `docs/02-architecture.md`
- [x] Actualizar `.env.example` con `STAFF_JWT_SECRET` y `STAFF_QR_JWT_SECRET`
- [x] Actualizar `CHANGELOG.md`
- [ ] Build + validación E2E

---

## Notas de Auditoría (2026-05-30)

Durante la revisión del documento previo al desarrollo se identificaron y corrigieron los siguientes errores, inconsistencias y riesgos de seguridad:

### Errores críticos corregidos

1. **Inconsistencia de rutas `/staff` vs `/mesero`:** El documento alternaba entre una ruta `/staff` pública sin login y `/mesero` con login. Se unificó todo bajo `/mesero/*` con autenticación JWT.
2. **QR dinámico exponía `customer_id` en texto plano:** El diseño original proponía codificar datos crudos (`phone`, `name`, `id`, `ts`) en la URL del QR. Se corrigió a un **token JWT efímero firmado con `jose`** (`STAFF_QR_JWT_SECRET`) con payload enmascarado y expiración de 5 minutos.
3. **Validación de TTL del QR solo en frontend:** El documento indicaba que el frontend del mesero validaba `Date.now() - ts`. Esto es inseguro. Se reubicó la validación **obligatoriamente al servidor** (`/api/check-in`).
4. **Falta de rechazo explícito en modo `staff_verified`:** No estaba definido que el backend debe rechazar con **403** cualquier `action: 'checkin'` de cliente existente que no traiga `registered_by_staff_id` válido cuando `checkin_mode = 'staff_verified'`.
5. **`PointTransactionSource` no incluía `visit_staff`:** `awardVisitPoints()` y el enum de tipos deben ampliarse para mapear `staff_scan` → `'visit_staff'`.
6. **`getRecentVisit()` filtraba solo por `source = 'qr'`:** Esto permitiría duplicados cruzados (QR + staff_scan). Se documentó el fix de quitar el filtro por source.
7. **Rate limit por IP era removible:** El doc sugería reemplazar rate limit por IP con rate limit por staff. Se corrigió a **rate limit dual**: por IP siempre como capa base + por staff cuando aplica.
8. **Falta de tabla `staff_users` y RLS:** No se definía RLS para la nueva tabla ni endpoints del dashboard para que el admin gestione meseros.
9. **Falta de setting `checkin_first_visit_free`:** La sub-opción "primera visita libre" no tenía un mecanismo de configuración definido. Se agregó como key en `admin_settings`.
10. **`/staff` pública contradecía el requerimiento de login:** Se eliminó la propuesta de ruta pública sin auth.
11. **PIN obligatorio en todos los dispositivos = fricción innecesaria:** Post-auditoría se introdujo el modelo de **Dispositivo de Confianza** para el celular/tablet del restaurante, eliminando el login diario del mesero en el 90% de los casos de uso. El PIN individual se mantiene como opción avanzada para trazabilidad.

### Errores menores corregidos

- **`table_number`** ya existía en `visits` (migración 00009); el pendiente lo pedía como si no existiera.
- **Auto-logout 30 min:** se reclasificó como *Nice-to-have / Futuro* por alta complejidad en webapp.
- **Dependencias:** se agregó `bcryptjs` explícitamente; se aclaró que el PIN se hashea, no almacena en texto plano.
- **`CheckInForm.tsx`** hace auto-checkin inmediato hoy; se agregó requisito de que el lookup debe retornar `checkin_mode` para que el frontend decida si detener el auto-checkin.
- Se agregaron variables de entorno faltantes (`STAFF_JWT_SECRET`, `STAFF_QR_JWT_SECRET`) a la lista de pendientes y a `.env.example`.
- **Nuevo enfoque Device Trust (post-auditoría v2):** Se reemplazó el modelo "todos los meseros con PIN" por "dispositivo de confianza para el local + PIN opcional para celulares propios", reduciendo fricción del mesero a prácticamente cero.

### Archivos adicionales identificados que deben actualizarse

- `src/services/points.service.ts` — ampliar `awardVisitPoints` source
- `src/services/visit.service.ts` — ampliar `createVisit` source, fix `getRecentVisit`
- `src/services/customer.service.ts` — ampliar `incrementVisit` source
- `src/types/database.types.ts` — agregar `'visit_staff'` a `PointTransactionSource`
- `.env.example` — agregar secrets de staff

---

*Última actualización: 2026-05-30 v3 (Auto-checkin ELIMINADO: solo mesero registra visitas. Cliente nuevo: registro + welcome bonus + visita 1 automática. Cliente frecuente: siempre QR → mesero escanea.)*
