# 🧡 Cada1 — Centro de Mando (Notion) · Plano espejo

> Este documento es el **plano** del workspace de Notion **Cada1 | Software de Fidelización**.
> Todo lo que está aquí ya está **construido en Notion** (ver enlaces). Si cambias el sistema, actualiza este archivo.
>
> **Workspace:** Cada1 | Software de Fidelización
> **Página raíz:** [🧡 Cada1 · Centro de Mando](https://app.notion.com/p/Cada1-Sistema-de-fidelizaci-n-36aaf9ebce0780818b17ff4a5609c0dd) · `36aaf9eb-ce07-8081-8b17-ff4a5609c0dd`
> **Para quién:** Luis (dueño) + vendedores. Diseñado para **cero fricción mental**: abrir, ver qué toca, hacerlo.

---

## 🗺️ Mapa del centro de mando

```
🧡 CADA1 · Centro de Mando   (página raíz = dashboard)
│  ▸ Misión en 1 línea  +  🧭 "Empieza aquí"  +  🗂️ Secciones (navegación)
│
├── 🏛️ NEGOCIO
│     ├─ 🧡 Identidad de marca   → Qué somos · Qué hacemos · Filosofía · Misión/Visión/Valores · Historia
│     ├─ 💵 Precios y Paquetes
│     └─ ⚙️ Funcionamiento del Sistema
│
├── ⚙️ OPERACIÓN
│     ├─ 📋 Onboarding de Clientes  → Fases · Personalización (plantillas) · Manuales de uso · Capacitación del personal
│     ├─ 🔧 Implementación          → QRs físicos · Estrategias de activación (presencial + redes) · Medición
│     └─ 📝 Scripts y Templates     → Mensajes de venta, setup y reporte mensual
│
├── 📈 CRECIMIENTO E INFRA
│     ├─ 🎬 Contenido               → Flujo · Ideas · Guiones · Tipos · Medición (orgánico + pautas)
│     ├─ 🛠️ Plataformas y Herramientas
│     └─ 📊 Costos del Negocio
│
├── 🏆 GESTIÓN DE CLIENTES (bases de datos vivas)
│     ├─ 📞 Pipeline de Ventas      (Lead → Ganado/Perdido · Vendedor encargado)
│     ├─ 🏆 Clientes Activos        (1 fila por restaurante · Plan · Estado · Vendedor)
│     ├─ 🚀 Proyectos               (1 por cliente · % de avance)
│     ├─ ✅ Tareas                  (pendientes / completadas · ligadas a cliente)
│     └─ 💰 Seguimiento Mensual     (cobros y reportes)
│
├── 🎬 CONTENIDO (bases de datos vivas)
│     ├─ 📅 Calendario Editorial
│     └─ 🔗 Referencias de Contenido
│
└── ⏱️ Rutina de trabajo (diaria · semanal · mensual)  — al pie de la raíz
```

---

## 📇 Bases de datos (esquemas reales)

### 📞 Pipeline de Ventas · `36caf9eb-ce07-800e-8360-fa6107f7dedb`
Embudo para **vender el QR a restaurantes**. Vista recomendada: **Kanban por Estado**.

| Propiedad | Tipo | Opciones / Notas |
|-----------|------|------------------|
| **Restaurante** | Título | Nombre del restaurante |
| **Estado** | Select | `🆕 Lead nuevo`, `📞 Contactado`, `📅 Reunión agendada`, `💰 Propuesta enviada`, `✅ Ganado`, `❌ Perdido` |
| **Vendedor** | Persona | Quién lo gestiona |
| **Fuente** | Select | `Instagram`, `Referido`, `Frío`, `Presencial`, `Otro` |
| **Plan tentativo** | Select | `Básico $89K`, `Pro $149K`, `Enterprise $249K` |
| **Celular** | Teléfono | |
| **Ciudad** | Texto | |
| **Fecha de contacto** | Fecha | |
| **Fecha de reunión** | Fecha | |
| **Próxima acción** | Texto | ⚠️ Mantener SIEMPRE llena |
| **Notas** | Texto | |

### 🏆 Clientes Activos · `36caf9eb-ce07-8073-8cb9-d2e3c06c98a5`
Un restaurante por fila. Entra aquí cuando paga. Vista recomendada: **Kanban por Estado**.

| Propiedad | Tipo | Opciones / Notas |
|-----------|------|------------------|
| **Restaurante** | Título | |
| **Estado** | Select | `🛠️ En setup`, `✅ Activo`, `⚠️ En riesgo`, `⏸️ Pausado`, `❌ Cancelado` |
| **Plan** | Select | `Básico $89K`, `Pro $149K`, `Enterprise $249K` |
| **Estado de pago** | Select | `Setup pagado`, `Mensualidad al día`, `Atrasado` (manual, opcional) |
| **Día de cobro** | Número | Día del mes en que paga (1–31). Normalmente = día de activación |
| **Próximo pago** | Fecha | Fecha del próximo cobro. Al cobrar, avanzar +1 mes |
| **Estado de cobro** | Fórmula | Semáforo automático (ver lógica abajo) |
| **Vendedor encargado** | Persona | |
| **Celular** | Teléfono | |
| **Ciudad** | Texto | |
| **Fecha de activación** | Fecha | |
| **URL del sistema** | URL | Dashboard del cliente |
| **Próxima acción** | Texto | |
| **Notas** | Texto | |

**Lógica de "Estado de cobro"** (basado en días hasta `Próximo pago`):
`🟢 Al día` (faltan >3 d) · `🟠 Por vencer` (0–3 d) · `🟡 Toca pagar / ventana de gracia` (día de cobro hasta +5 d) · `🔴 Vencido` (>5 d sin pagar) · `⚪ Sin fecha de cobro` si `Próximo pago` está vacío.

### 🚀 Proyectos · `36caf9eb-ce07-8080-b307-e8c539bb0cf4`
Un proyecto de implementación por cliente, con **barra de progreso**. (Conserva datos previos.)
Campos clave: `Nombre del Proyecto`, `Estado`, `Fase`, `Progreso %`, `Barra de progreso` (fórmula), `Responsable`, `Fecha de inicio`, `Fecha de entrega`, `Próxima acción`, `Notas`.

### ✅ Tareas · `374af9eb-ce07-8130-b7fc-ebc15a81bc4b`
Tareas sueltas del equipo (pendientes / completadas).

| Propiedad | Tipo | Opciones |
|-----------|------|----------|
| **Tarea** | Título | |
| **Estado** | Select | `Pendiente`, `En progreso`, `Bloqueado`, `Hecho` |
| **Prioridad** | Select | `Alta`, `Media`, `Baja` |
| **Cliente** | Texto | A qué restaurante pertenece |
| **Responsable** | Persona | |
| **Fecha límite** | Fecha | |
| **Notas** | Texto | |

### 💰 Seguimiento Mensual · `374af9eb-ce07-8115-9587-f6a570995f3f`
Una fila por mes y cliente. Para cobros y reportes.

| Propiedad | Tipo | Opciones |
|-----------|------|----------|
| **Mes** | Título | ej. "Junio 2026 — Sushi Service" |
| **Cliente** | Texto | |
| **Plan** | Select | `Básico $89K`, `Pro $149K`, `Enterprise $249K` |
| **Monto COP** | Número | |
| **Mensualidad cobrada** | Checkbox | |
| **Fecha de cobro** | Fecha | |
| **Notas** | Texto | |

### 📅 Calendario Editorial · `36baf9eb-ce07-80d5-b42a-e6884d73f9cb`
Pipeline de contenido. Estados: `💡 Idea` → `✍️ Guión` → `🎬 En edición` → `📆 Programado` → `✅ Publicado`.
Propiedades: `Título del post`, `Plataforma`, `Tipo de contenido`, `Pilar`, `Estado`, `Fecha de publicación`, `CTA`, `Hashtags`, `Estructura`, `Alcance`, `Interacciones`.

### 🔗 Referencias de Contenido · `36baf9eb-ce07-80f0-80c3-c24cfe10c239`
Banco de inspiración: `Título`, `URL`, `Tipo`, `Plataforma`, `Tags`, `Por qué me gusta`.

---

## 📄 Páginas (contenido)

| Página | ID | Qué contiene |
|--------|-----|--------------|
| 🧡 [Identidad de marca](https://app.notion.com/p/36baf9ebce07804abf2bfd9f7f0faf3a) | `36baf9eb-ce07-804a-bf2b-fd9f7f0faf3a` | Qué somos · Qué hacemos · Filosofía · Misión/Visión/Valores · **Historia** |
| 📋 [Onboarding de Clientes](https://app.notion.com/p/374af9ebce07814db662e95bf6e62107) | `374af9eb-ce07-814d-b662-e95bf6e62107` | Fases 1-4 · Personalización (plantillas) · Manuales de uso · Capacitación del personal |
| 🔧 [Implementación](https://app.notion.com/p/Implementaci-n-37caf9ebce0781c3a51fc2ab19dfabd9) | `37caf9eb-ce07-81c3-a51f-c2ab19dfabd9` | QRs físicos paso a paso · Activación presencial + redes · Cómo medir |
| 🎬 [Contenido](https://app.notion.com/p/Contenido-37caf9ebce078198b32bd6ff08febdb7) | `37caf9eb-ce07-8198-b32b-d6ff08febdb7` | Flujo · Ideas · Guiones · Tipos · Medición (orgánico + pautas) |
| 💵 [Precios y Paquetes](https://app.notion.com/p/374af9ebce0781f48905d91c51a32efc) | `374af9eb-ce07-81f4-8905-d91c51a32efc` | Planes mensuales + setup único |
| 🛠️ [Plataformas y Herramientas](https://app.notion.com/p/374af9ebce0781fb8df6ece038460a5c) | `374af9eb-ce07-81fb-8df6-ece038460a5c` | Vercel · Supabase · Twilio · n8n |
| ⚙️ [Funcionamiento del Sistema](https://app.notion.com/p/374af9ebce0781d9913bc6ec7da66d66) | `374af9eb-ce07-81d9-913b-c6ec7da66d66` | Flujo del cliente · Tiers · Automatizaciones |
| 📊 [Costos del Negocio](https://app.notion.com/p/374af9ebce0781678ae4d88b95a742aa) | `374af9eb-ce07-8167-8ae4-d88b95a742aa` | Costos por cliente · márgenes |
| 📝 [Scripts y Templates](https://app.notion.com/p/374af9ebce0781f1a677ee0ec33ab4c4) | `374af9eb-ce07-81f1-a677-ee0ec33ab4c4` | Aproximación · setup · reporte mensual |

---

## ⏱️ Rutina de trabajo (sin fricción)

**🟢 Diaria · 5 min**
1. Abrir **Pipeline de Ventas** → mover leads de etapa.
2. Revisar **Próxima acción** y hacer la del día.
3. Mirar **✅ Tareas** que vencen hoy.

**🟡 Semanal · 30 min**
1. Leads sin avance hace +3 días → contactar.
2. Clientes **En riesgo** → llamar.
3. Publicar 2-3 contenidos y **medir** los anteriores.

**🔵 Mensual · 1 h**
1. Llenar **💰 Seguimiento Mensual** por cliente.
2. Cobrar mensualidades + revisar saldo Twilio.
3. Enviar **reporte mensual** a cada restaurante (plantilla en Scripts).

---

## 🔧 Cómo editar Notion programáticamente (referencia técnica)

- Token de integración de Notion guardado en `.notion_token` (gitignored; **NO** commitear).
- Workspace de la integración: **Cada1 | Software de Fidelización**.
- API REST: `https://api.notion.com/v1` con headers `Authorization: Bearer <token>` y `Notion-Version: 2022-06-28`.
- La integración **solo ve** páginas compartidas con ella dentro de Cada1 (no toca el workspace «Molun Store» / Constelarys).
