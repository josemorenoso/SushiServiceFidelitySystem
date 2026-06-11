# Estructura de Notion para RestaurantQR — CRM + Operaciones

> Copia exacta de bases de datos, propiedades y vistas. Puedes crear esto en Notion gratis en 30 minutos.

---

## Workspace: RestaurantQR Operaciones

Crear un workspace nuevo o usar tu workspace personal. Crear estas 4 bases de datos:

---

## Base de datos 1: "Leads y Clientes"

**Tipo:** Base de datos (tabla)
**Ubicación:** Página principal del workspace

### Propiedades:

| Propiedad | Tipo | Opciones / Notas |
|-----------|------|----------------|
| **Nombre** | Título | Nombre del restaurante |
| **Estado** | Select | `Lead nuevo`, `Reunión agendada`, `Cierre pendiente`, `Venta cerrada`, `En setup`, `Cliente activo`, `Atrasado`, `Cancelado` |
| **Prioridad** | Select | `Alta`, `Media`, `Baja` |
| **Nombre del dueño** | Texto | |
| **Celular dueño** | Teléfono | |
| **Ciudad** | Texto | |
| **Fuente** | Select | `Instagram`, `Referido`, `Frío`, `Evento`, `Otro` |
| **Plan contratado** | Select | `250k` |
| **Setup pagado** | Checkbox | |
| **Mensualidad activa** | Checkbox | |
| **Fecha de contacto** | Fecha | |
| **Fecha de reunión** | Fecha | |
| **Fecha de activación** | Fecha | Cuando quedó operativo |
| **URL del proyecto** | URL | ej: `https://sushi-fidelity.vercel.app` |
| **Notas** | Texto largo | |
| **Asignado a** | Persona | Quien lo está gestionando (tú o asistente) |

### Vistas recomendadas:

1. **Vista "Pipeline"** (Tabla): Todas las entradas, ordenadas por Estado
2. **Vista "Ventas"** (Kanban): Agrupado por Estado (Lead nuevo → Cliente activo)
3. **Vista "Clientes Activos"** (Tabla): Filtro `Estado = Cliente activo`
4. **Vista "Setup Pendiente"** (Tabla): Filtro `Estado = En setup`
5. **Vista "Cobros"** (Tabla): Mostrar `Plan`, `Setup pagado`, `Mensualidad activa`

---

## Base de datos 2: "Tareas de Implementación"

**Tipo:** Base de datos
**Ubicación:** Dentro de cada entrada de "Leads y Clientes" (como base enlazada) o página separada

### Propiedades:

| Propiedad | Tipo | Opciones |
|-----------|------|----------|
| **Tarea** | Título | ej: "Crear proyecto Supabase" |
| **Cliente** | Relación → "Leads y Clientes" | |
| **Fase** | Select | `Fase 1: Lead`, `Fase 2: Venta`, `Fase 3: Setup`, `Fase 4: Activo`, `Fase 5: Offboarding` |
| **Estado** | Select | `Pendiente`, `En progreso`, `Bloqueado`, `Hecho` |
| **Responsable** | Persona | |
| **Fecha límite** | Fecha | |
| **Fecha de completado** | Fecha | |
| **Notas / Bloqueo** | Texto largo | Si está bloqueado, explicar por qué |
| **Checklist** | Checkbox | (opcional, para subtareas) |

### Vistas recomendadas:

1. **Vista "Hoy"** (Tabla): Filtro `Fecha límite = hoy`
2. **Vista "Mi semana"** (Tabla): Filtro `Fecha límite = esta semana`
3. **Vista "Bloqueados"** (Tabla): Filtro `Estado = Bloqueado` — REVISAR TODOS LOS DÍAS
4. **Vista "Setup por cliente"** (Tabla): Agrupado por Cliente

### Plantillas de tareas pre-creadas (para cada nuevo cliente):

Al crear un nuevo cliente, duplicar este grupo de tareas:

**Fase 2 — Venta:**
- [ ] Primera llamada o mensaje al lead
- [ ] Reunión de cierre agendada
- [ ] Enviar propuesta / contrato
- [ ] Recibir pago del setup

**Fase 3 — Setup:**
- [ ] Recolectar datos del cliente (logo, colores, mesas, WhatsApp)
- [ ] Crear proyecto en Supabase
- [ ] Ejecutar migraciones SQL
- [ ] Crear usuario admin en Supabase Auth
- [ ] Configurar Twilio (número + plantillas)
- [ ] Fork del repo y personalizar branding
- [ ] Deploy en Vercel
- [ ] Configurar variables de entorno
- [ ] Configurar recompensas en dashboard
- [ ] Generar QRs (1 por mesa)
- [ ] Imprimir QRs
- [ ] Prueba end-to-end (registro + WhatsApp + visita)
- [ ] Capacitación al admin del restaurante

**Fase 4 — Activo:**
- [ ] Enviar reporte de activación
- [ ] Cobrar primera mensualidad

---

## Base de datos 3: "Inventario de Clientes Activos" (Repositorio técnico)

**Tipo:** Base de datos
**Ubicación:** Página separada, acceso restringido (contiene datos sensibles)

### Propiedades:

| Propiedad | Tipo | Notas |
|-----------|------|-------|
| **Restaurante** | Título | Nombre |
| **Relación** | Relación → "Leads y Clientes" | |
| **Supabase URL** | URL | |
| **Supabase Anon Key** | Texto | (sensible) |
| **Supabase Service Key** | Texto | (sensible) |
| **Twilio Account SID** | Texto | (sensible) |
| **Twilio Auth Token** | Texto | (sensible) |
| **Twilio WhatsApp From** | Teléfono | |
| **Vercel URL** | URL | |
| **Repo GitHub** | URL | |
| **Estado Twilio** | Select | `Sandbox`, `Número aprobado`, `En revisión` |
| **Plantillas aprobadas** | Checkbox | |
| **Último deploy** | Fecha | |
| **Notas técnicas** | Texto largo | Errores, workarounds, etc. |

> ⚠️ Esta base debe estar en una página privada. NO compartir con asistentes que no necesiten acceso a credenciales.

---

## Base de datos 4: "Seguimiento Mensual"

**Tipo:** Base de datos
**Ubicación:** Página separada

### Propiedades:

| Propiedad | Tipo | Notas |
|-----------|------|-------|
| **Título** | Título | ej: "Mayo 2026 — Sushi Service" |
| **Cliente** | Relación → "Leads y Clientes" | |
| **Mes** | Select | `Enero`, `Febrero`, etc. |
| **Clientes registrados (nuevos)** | Número | Cuántos se inscribieron este mes |
| **Visitas totales** | Número | |
| **Mensajes enviados** | Número | |
| **Saldo Twilio** | Número | En USD |
| **Mensualidad cobrada** | Checkbox | |
| **Llamada de check-in hecha** | Checkbox | |
| **Notas** | Texto largo | Qué dijo el dueño, problemas, oportunidades |

### Vistas recomendadas:

1. **Vista "Este mes"** (Tabla): Filtro `Mes = [mes actual]`
2. **Vista por cliente** (Tabla): Agrupado por Cliente

---

## Páginas adicionales recomendadas en Notion

### 1. "Scripts y Templates"
- Texto de primera aproximación (copy-paste para WhatsApp)
- Texto de seguimiento a 7 días
- Texto de recordatorio de reunión
- Texto de "estamos configurando tu sistema"
- Texto de reporte mensual para enviar al cliente

### 2. "Precios y Paquetes"
- Tabla con los 3 planes
- Qué incluye cada uno
- Precio de setup
- Formas de pago aceptadas

### 3. "Conocimiento Base" (para delegar)
- Cómo crear un proyecto en Supabase (con screenshots)
- Cómo ejecutar migraciones SQL
- Cómo usar Vercel
- Cómo crear plantillas en Twilio
- Qué hacer si una plantilla es rechazada por Meta
- Qué hacer si el QR no escanea
- Quién contactar si hay un bug (tú o developer)

---

## Instrucciones para importar a Notion

1. Ve a notion.so
2. Crea un nuevo workspace o usa el tuyo
3. Crea una página: "RestaurantQR Operaciones"
4. Dentro, crea 4 bases de datos usando los tipos y propiedades de arriba
5. Copia las vistas exactas (tabla, kanban, filtros)
6. En "Tareas de Implementación", crea una plantilla con las tareas pre-cargadas
7. Comparte el workspace con tu asistente (permiso de "Can edit" en las bases operativas, "Can view" en la base de inventario técnico)

---

## Flujo de trabajo diario (para ti o asistente)

**Cada mañana (10 min):**
1. Abrir Notion → "Tareas de Implementación" → Vista "Hoy"
2. Ver qué vence hoy, mover a `En progreso`
3. Abrir vista "Bloqueados" — ¿hay algo atorado? ¿Necesitas ayuda?

**Cada semana (30 min):**
1. Revisar "Leads y Clientes" → Vista "Cierre pendiente"
2. Llamar o escribir a los que están ahí hace más de 3 días
3. Revisar "Seguimiento Mensual" → ver quién no ha pagado

**Cada mes (1 hora):**
1. Crear entrada de "Seguimiento Mensual" para cada cliente activo
2. Revisar saldos Twilio
3. Enviar reportes
4. Cobrar mensualidades
