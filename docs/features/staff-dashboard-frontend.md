# Instrucciones: Frontend Dashboard de Meseros (Staff Dashboard)

## Contexto
El backend del sistema **Staff QR Scan** ya está implementado y funcional. Falta el **frontend del dashboard de admin** para que el dueño pueda gestionar meseros y dispositivos de confianza desde `/dashboard/staff`.

## Objetivo
Crear la página `/dashboard/staff` con las siguientes funcionalidades:

---

## Funcionalidades Requeridas

### 1. Listado de Meseros
- **GET `/api/dashboard/staff`** (requiere admin JWT — Supabase Auth)
- Mostrar tabla/cards con: Nombre, Celular, Rol, Estado (activo/inactivo), Último login, Fecha creación
- Badge de color por rol: `waiter` (gris), `supervisor` (azul), `admin` (púrpura)
- Toggle de activo/inactivo in-place (llama a PATCH)

### 2. Crear Mesero
- **POST `/api/dashboard/staff`**
- Formulario modal o sección:
  - `name` (text, req)
  - `phone` (tel, 10 dígitos, req)
  - `pin` (password numeric, 4-6 dígitos, req)
  - `role` (select: waiter / supervisor / admin, default waiter)
- Validaciones frontend antes de enviar
- Mensaje de éxito / error (409 si duplicado)

### 3. Editar Mesero
- **PATCH `/api/dashboard/staff`**
- Campos editables inline o en modal:
  - `is_active` (toggle switch)
  - `name` (text)
  - `role` (select)
  - `pin` (opcional, solo si se quiere resetear — vacío = no cambiar)
- Mínimo uno de los campos debe cambiar

### 4. Eliminar Mesero
- **DELETE `/api/dashboard/staff?id={id}`**
- Confirmación modal "¿Eliminar a {nombre}? Esta acción no se puede deshacer."
- Actualizar lista tras confirmar

### 5. Listado de Dispositivos de Confianza
- La misma respuesta GET trae `devices` array
- Mostrar tabla: Nombre del device, estado (confiable/expirado), Fecha activación, Último uso
- Permitir revocar (DELETE) o reactivar device (esto puede requerir endpoint adicional o usar PATCH)

### 6. Filtros / Búsqueda
- Búsqueda por nombre o celular del mesero
- Filtro por rol
- Filtro por estado activo/inactivo

---

## API Endpoints Disponibles

| Método | Endpoint | Body/Query | Descripción |
|--------|----------|------------|-------------|
| GET | `/api/dashboard/staff` | - | `{ staff: [...], devices: [...] }` |
| POST | `/api/dashboard/staff` | `{ name, phone, pin, role }` | Crear mesero. 201 = creado, 409 = duplicado |
| PATCH | `/api/dashboard/staff` | `{ id, is_active?, name?, role?, pin? }` | Actualizar. pin solo si se quiere resetear. |
| DELETE | `/api/dashboard/staff?id={id}` | - | Eliminar mesero |

### Respuesta GET
```json
{
  "staff": [
    { "id": "uuid", "name": "Carlos", "phone": "3001234567", "role": "waiter", "is_active": true, "last_login_at": "2026-05-30T...", "created_at": "..." }
  ],
  "devices": [
    { "id": "uuid", "staff_user_id": "uuid", "device_name": "Celular del Local", "is_trusted": true, "trusted_at": "2026-05-30T...", "expires_at": null, "last_used_at": "..." }
  ]
}
```

### Respuestas de Error
```json
{ "error": "No autorizado", "message": "..." }  // 401
{ "error": "Duplicado", "message": "Ya existe un mesero con ese número" }  // 409
{ "error": "PIN inválido", "message": "El PIN debe ser numérico de 4 a 6 dígitos" }  // 400
{ "error": "Error del servidor", "message": "..." }  // 500
```

---

## Convenciones del Proyecto

- **Ruta:** `src/app/(dashboard)/dashboard/staff/page.tsx`
- **Estilos:** TailwindCSS (clases utilitarias inline, NO module.css)
- **Componentes UI:** shadcn/ui si aplica (Button, Dialog, Input, Select, Badge, Table, Switch)
- **Auth:** El dashboard ya tiene el Supabase Auth context. Usar `useAuth()` o `useSupabase()` existentes.
- **Fetch:** Usar `fetch()` nativo con `Authorization: Bearer {token}` del admin.
- **Loading:** Estados locales con `useState`. Skeleton loaders recomendados.
- **Toasts:** Usar el toast/toaster existente del dashboard (si hay) o mostrar mensajes inline.

## Estilo Visual
- Misma estética del dashboard existente (fondo gris-50, cards blancas, red-500 como color de acción)
- Header con título "Gestión de Meseros" + botón "+ Nuevo mesero"
- Layout de dos columnas en desktop: meseros a la izquierda (60%), dispositivos a la derecha (40%)
- En mobile: una sola columna, meseros primero

## Dependencias
No se requieren nuevas. Si falta algún icono de lucide-react, usar el existente.

## Tips
- El backend valida que solo admin JWT pueda acceder a `/api/dashboard/staff`.
- El PIN se hashea en el backend con bcrypt; el frontend solo envía el PIN en texto plano (por ahora; si se quiere encriptar, avisar).
- `registered_by_staff_id` en visits permite trazabilidad; esto NO se muestra en el dashboard de meseros pero sí puede agregarse como columna en analytics.
