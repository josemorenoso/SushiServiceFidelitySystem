# Feature: Verificación Cliente-Mesero con QR Dinámico

> **Estado:** Pendiente (Documentación de diseño)
> **Prioridad:** URGENTE
> **Archivos clave estimados:** `src/components/features/check-in/CheckInForm.tsx`, `src/app/(public)/staff/page.tsx`, `src/app/api/check-in/route.ts`
> **Dependencias nuevas:** `qrcode.react` (generación QR cliente), `html5-qrcode` (escaneo mesero)

---

## Descripción

Sistema de verificación presencial de dos pasos entre cliente y mesero usando códigos QR dinámicos.

**Paso 1 (Cliente):** Escanea el QR estático del restaurante → ingresa su número de celular en `/check-in` → el sistema muestra un **QR dinámico personal** con sus datos.

**Paso 2 (Mesero):** Escanea el QR del cliente con su celular desde `/staff` → confirma mesa → sistema registra la visita.

Esta feature introduce un paso de verificación interactivo entre cliente y restaurante sin romper el flujo actual. El check-in ya no es automático tras ingresar el celular; ahora requiere validación presencial por parte del personal.

---

## Objetivo

- Eliminar la necesidad de que los clientes guarden o lleven un QR físico permanente.
- Reutilizar el flujo existente de `/check-in` añadiendo una capa de verificación mesero-cliente.
- Permitir que el mesero valide la presencia física del cliente antes de registrar la visita.
- Mantener 100% de compatibilidad con el sistema de puntos, tiers y Mystery Box existente.

---

## Modelo de Datos

**Sin cambios de schema.** Reutiliza tablas existentes:

| Tabla | Uso en esta feature |
|-------|-------------------|
| **customers** | Fuente de datos del cliente (phone, name, total_visits, current_tier) |
| **visits** | Registro de la visita con `source = 'staff_scan'` (nuevo valor enum) |
| **restaurant_locations** | Geolocalización del restaurante (ya implementado en v1.0.5) |
| **point_transactions** | Transacción de puntos por la visita registrada |
| **mystery_box_results** | Resultado de la caja misteria si aplica |

> **Nota:** No se requieren nuevas tablas ni columnas. El QR dinámico es generado en el frontend a partir de datos del cliente existentes. No se almacena el QR en la base de datos.

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
6. **Respuesta no encontrado:** Flujo de registro nuevo (nombre, cumpleaños) → tras registrar, también muestra el QR personal.

### Paso 2: Mesero escanea el QR del cliente

1. El mesero abre `/staff` en su celular (ruta pública, sin auth).
2. La página solicita permiso de cámara y muestra el visor de escaneo.
3. El mesero apunta su cámara al QR del cliente.
4. El sistema extrae del QR: `phone`, `name`, `customer_id` (u otro identificador seguro).
5. Muestra tarjeta de confirmación:
   - Nombre del cliente.
   - Número de celular (máscara parcial).
   - Dropdown/input para seleccionar **número de mesa**.
   - Botón "Registrar Visita".
6. El mesero selecciona mesa y confirma.

### Paso 3: Registro de visita

1. El frontend del mesero hace `POST /api/check-in` con:
   ```json
   {
     "phone": "3001234567",
     "action": "checkin",
     "source": "staff_scan",
     "table_number": "12",
     "lat": null,
     "lon": null
   }
   ```
2. El API route ejecuta el mismo flujo de check-in existente:
   - Incrementa `total_visits`.
   - Crea registro en `visits` (source = 'staff_scan').
   - Evalúa y otorga puntos aleatorios.
   - Evalúa subida de tier.
   - Ejecuta lógica de Mystery Box si aplica.
   - Envía mensaje WhatsApp de confirmación.
3. El mesero ve pantalla de éxito con resumen: puntos ganados, tier, recompensa si aplica.

---

## Componentes / Archivos (planificados)

| Archivo | Responsabilidad |
|---------|----------------|
| `src/components/features/check-in/CheckInForm.tsx` | **MODIFICAR** — Post-lookup, mostrar QR dinámico del cliente en lugar de auto-registrar visita. |
| `src/components/features/staff/StaffScanner.tsx` | **CREAR** — Componente de escaneo QR con `html5-qrcode`. |
| `src/components/features/staff/StaffScanner.types.ts` | **CREAR** — Tipos del escáner. |
| `src/components/features/staff/StaffConfirmation.tsx` | **CREAR** — Tarjeta de confirmación post-escaneo (datos cliente + input mesa). |
| `src/components/features/staff/StaffSuccess.tsx` | **CREAR** — Pantalla de éxito tras registrar visita desde staff. |
| `src/app/(public)/staff/page.tsx` | **CREAR** — Página pública para el mesero (escaneo + confirmación). |
| `src/app/api/check-in/route.ts` | **MODIFICAR** — Aceptar `source: 'staff_scan'` y `table_number`. Saltar validación de geolocalización cuando source sea staff_scan (el mesero ya está en el local). |
| `src/lib/utils/qrcode.ts` | **CREAR** (opcional) — Helper para generar la URL/data del QR dinámico. |

---

## API / Endpoints

### POST /api/check-in (modificación)

**Body extendido (nuevos campos opcionales):**
```json
{
  "phone": "3001234567",
  "action": "checkin",
  "source": "staff_scan",
  "table_number": "12"
}
```

**Comportamiento por `source`:**
| source | Valida geolocalización | Comportamiento |
|--------|----------------------|----------------|
| `undefined` / `"qr"` | SÍ | Flujo actual v1.0.5 (cliente debe estar cerca) |
| `"staff_scan"` | NO | El mesero confirma presencia física. Se salta la validación GPS. |

> **Razón:** El mesero está físicamente en el restaurante. No tiene sentido pedirle GPS. La validación de presencia la hace el mesero humano al escanear el QR del cliente frente a él.

---

## UI / Pantallas

### Pantalla del Cliente — "Tu QR" (post-lookup en CheckInForm)

- QR grande centrado (generado con `qrcode.react`).
- Encabezado: "¡Hola, [Nombre]!"
- Subtítulo: "Muéstrale este código a tu mesero"
- Datos del cliente: Tier, visitas totales, puntos actuales.
- Instrucciones breves en texto.
- Diseño optimizado para pantallas pequeñas (celular del cliente).

**Contenido del QR (ejemplo URL codificada):**
```
https://[dominio]/staff?phone=3001234567&name=Juan+Perez&id=uuid&ts=1716912000
```
- `ts` (timestamp) para evitar reutilización del QR escaneado por captura de pantalla antigua (validación de tiempo de vida del QR).

### Pantalla del Mesero — Escáner (`/staff`)

- Pantalla completa con visor de cámara (`html5-qrcode`).
- Overlay con marco de escaneo (diseño tipo "cámara de pago").
- Botón para encender/apagar linterna (si el navegador lo permite).
- Mensaje guía: "Apunta al código QR del cliente".
- Fallback: input manual de número de celular si la cámara falla.

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
| **Página `/staff`** | ✅ Aislada | Cada deploy tiene su propia `/staff`. Los meseros de un restaurante no ven datos de otro. |
| **Dependencias** | ✅ Idénticas | `qrcode.react` y `html5-qrcode` se instalan en el repo plantilla y se clonan a cada cliente. |
| **Configuración** | ✅ Cero config extra | No requiere variables de entorno nuevas. No requiere cambios en Supabase. |

### Proceso de rollout a N clientes

1. Implementar en el **repo plantilla** (este repo).
2. Hacer commit + push a `main`.
3. Para cada cliente existente:
   - `git pull` en su repo clonado.
   - `npm install` (instala nuevas dependencias).
   - Re-deploy en Vercel (automático si tiene Git integration).
4. Cada cliente recibe la feature de forma aislada sin migraciones de DB.

> **Consecuencia:** Esta feature es "plug & play" para todos los restaurantes que usen esta plantilla. No requiere acciones especiales por cliente.

---

## Restricciones

- La ruta `/staff` es **100% pública** — sin auth. El mesero no necesita login.
- El QR dinámico del cliente debe tener un **tiempo de vida corto** (ej: 5 minutos) para evitar reutilización de screenshots antiguas. Validar `ts` en `/staff`.
- Si el cliente no tiene cámara o no quiere usarla, el mesero puede usar el **modo manual**: escribir el número de celular del cliente en un input.
- La validación de geolocalización del cliente se **salta** cuando `source = 'staff_scan'`.
- El campo `table_number` es opcional pero recomendado (para analytics futuros).
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
1. `npm install qrcode.react html5-qrcode`
2. Actualizar `package.json` (ya lo hace npm).
3. Verificar que el build compila sin errores.

### Fase 2: Generación del QR dinámico del cliente
4. En `CheckInForm.tsx`, tras `action: 'lookup'` exitoso:
   - Mostrar nueva pantalla/estado `showCustomerQR`.
   - Generar URL de staff con datos del cliente + timestamp.
   - Renderizar `<QRCodeCanvas value={qrUrl} size={256} />`.
   - Mostrar datos del cliente (nombre, tier, visitas).
5. Asegurar diseño responsive para celulares del cliente.
6. El QR debe codificar: `phone`, `name`, `customer_id`, `ts` (timestamp de generación).

### Fase 3: Página de escaneo para el mesero (`/staff`)
7. Crear `src/app/(public)/staff/page.tsx`.
8. Crear componente `StaffScanner.tsx` con `html5-qrcode`:
   - Inicializar escáner al montar.
   - Manejar permisos de cámara.
   - Fallback a input manual si no hay cámara.
9. Al escanear exitosamente:
   - Parsear URL del QR.
   - Validar que el timestamp no exceda los 5 minutos.
   - Mostrar `StaffConfirmation.tsx` con datos del cliente.

### Fase 4: Confirmación y registro
10. En `StaffConfirmation.tsx`:
    - Mostrar datos del cliente parseados del QR.
    - Input para número de mesa (requerido).
    - Botón "Registrar Visita" → POST a `/api/check-in`.
11. Crear `StaffSuccess.tsx` para pantalla post-registro.

### Fase 5: Ajuste del API check-in
12. En `/api/check-in/route.ts`:
    - Extender `CheckInRequestBody` con `source?: 'qr' | 'staff_scan'` y `table_number?: string`.
    - Si `source === 'staff_scan'`: omitir validación de geolocalización.
    - Guardar `table_number` en `visits` (si la columna no existe, agregarla).
    - Resto del flujo (puntos, tiers, Mystery Box, WhatsApp) sin cambios.

### Fase 6: Documentación
13. Actualizar `docs/API_DOCS.md` con el nuevo comportamiento de `/api/check-in`.
14. Actualizar `docs/DB_SCHEMA.md` si se agrega `table_number` a `visits`.
15. Actualizar `docs/02-architecture.md` (Tabla de Lookup) con nuevos archivos.
16. Agregar entrada en `CHANGELOG.md`.
17. Actualizar este archivo `docs/features/staff-qr-scan.md` con estado COMPLETED.

### Fase 7: Validación
18. `npm run build` sin errores.
19. Probar flujo completo localmente:
    - Cliente escanea → ingresa celular → ve QR.
    - Mesero abre `/staff` → escanea QR → registra mesa → visita confirmada.
20. Verificar que el flujo QR original (`/check-in` sin mesero) sigue funcionando.

---

## Pendiente

- [ ] Instalar dependencias `qrcode.react` y `html5-qrcode`
- [ ] Implementar generación de QR dinámico en `CheckInForm.tsx`
- [ ] Crear página `/staff` y componentes de escaneo
- [ ] Crear componentes `StaffScanner`, `StaffConfirmation`, `StaffSuccess`
- [ ] Modificar `/api/check-in/route.ts` para `source: 'staff_scan'`
- [ ] Agregar columna `table_number` a tabla `visits` (si se decide trackear)
- [ ] Actualizar `docs/API_DOCS.md`
- [ ] Actualizar `docs/DB_SCHEMA.md` (si hay cambio de schema)
- [ ] Actualizar `CHANGELOG.md`
- [ ] Build + validación E2E
