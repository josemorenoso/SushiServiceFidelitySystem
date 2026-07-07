# Proceso de Ventas e Implementación — RestaurantQR

> Documento operativo (no técnico). Este es el paso a paso que tú o un asistente siguen cada vez que entra un cliente nuevo.

---

## Fase 1: Lead (El restaurante te contacta)

**Quién lo hace:** Tú (ventas)
**Duración:** 15-30 min
**Objetivo:** Cerrar la primera reunión

### Paso 1.1 — Registrar el lead en Notion
- Ir a la base **"Leads"**
- Crear entrada con: Nombre del restaurante, Nombre del dueño/gerente, Celular, Ciudad, Fecha de contacto, Fuente (Instagram, referido, frío, etc.)
- Estado: `Lead nuevo`
- Prioridad: Alta / Media / Baja

### Paso 1.2 — Primera llamada o mensaje
**Script sugerido (WhatsApp o llamada):**
> "Hola [Nombre], soy Luis de RestaurantQR. Veo que tienes [tipo de restaurante]. Te escribo porque ayudamos a restaurantes como el tuyo a que los clientes vuelvan más seguido con un sistema de fidelidad por WhatsApp — sin apps, sin complicaciones. ¿Tienes 10 min esta semana para mostrarte cómo funciona?"

**Si dice que sí:** Agendar reunión (15-20 min), pasar estado a `Reunión agendada`.
**Si dice que no:** Programar seguimiento en 7 días, pasar estado a `Seguimiento`.

---

## Fase 2: Reunión de Cierre (Demo + Propuesta)

**Quién lo hace:** Tú (ventas)
**Duración:** 20-30 min
**Objetivo:** Cerrar la venta con una propuesta clara

### Paso 2.1 — Antes de la reunión
- Preparar demo: abrir el dashboard de un cliente existente o el demo local
- Tener lista la propuesta de precios (ver DEPLOYMENT_GUIDE.md → "Pricing sugerido")

### Paso 2.2 — Durante la reunión
1. **Preguntar primero:** ¿Cuántos clientes tienen al mes? ¿Usan WhatsApp Business? ¿Tienen programa de fidelidad hoy?
2. **Mostrar el QR:** Escanea con tu celular, muestra el flujo de registro
3. **Mostrar el mensaje de WhatsApp:** "Así se siente para el cliente"
4. **Mostrar el dashboard:** "Así ves tú quién vino, cuándo, y qué premios ganaron"
5. **Mencionar lo que NO necesitan:** No app, no tarjetas, no hardware
6. **Precio único:** $250.000 COP/mes — clientes ilimitados, campañas ilimitadas, soporte incluido
7. **Setup:** Pago único $1.200.000 COP (implementación completa en 2-4 horas)
8. **Cierre:** "¿Empezamos esta semana? Te mando el contrato y el pago del setup, y en 48h estás operando."

### Paso 2.3 — Después de la reunión
- Actualizar Notion: Estado → `Cierre pendiente` o `Venta cerrada`
- Si cerró: Crear tarea en Notion → `Fase 3: Setup` con fecha de inicio
- Enviar contrato (puedes usar un simple PDF o HelloSign)
- Recibir pago del setup

---

## Fase 3: Setup (Implementación técnica)

**Quién lo hace:** Tú o un asistente técnico (con esta guía)
**Duración:** ~1-1.5 horas (bajó de 3-4h desde que el sistema es multitenant — ver
`docs/04-deployment.md` §6). **No se crea proyecto Supabase ni Vercel nuevo, ni se clona el
repo.** Un cliente nuevo es una fila en el Supabase compartido + un dominio en el Vercel
compartido.

### Paso 3.1 — Recolectar datos del cliente (15 min)
Crear carpeta en Notion o Drive: `Clientes / [Nombre Restaurante]`

| Dato | Cómo se obtiene |
|------|-----------------|
| Nombre del restaurante + nombre corto | El cliente te lo dice |
| Label del staff (Mesero/Barista/Barbero...) | Según el tipo de negocio |
| Logo (PNG sin fondo) | Pedirlo. Si no tiene, usar Canva gratis |
| Colores de marca (hex, opcional) | Pedirlo o sacar del Instagram del restaurante |
| Número de WhatsApp del negocio (humano, para pedidos/dudas) | Preguntar. Debe ser un celular real |
| Número/subcuenta de WhatsApp Twilio (automático) | Del cliente si ya lo tiene, o se crea Sandbox temporal |
| Precio promedio del ticket | Preguntar (para benchmarks) |
| Google Maps review link | Instagram, Google Maps |
| Recompensas que quiere dar | Ej: visita 3 = bebida gratis, visita 5 = rollo gratis |
| Subdominio elegido | Ej. `clubdonalirio.constelarys.com` |

**Acción en Notion:** Mover estado a `En setup — Recopilando datos`

### Paso 3.2 — Insertar el tenant en Supabase (10 min)
Seguir `docs/04-deployment.md` §6 Paso 1: `INSERT INTO tenants (...)` en el SQL Editor del
proyecto compartido, con la marca completa en `config`.

**Acción en Notion:** Marcar checkbox `Tenant creado en Supabase`

### Paso 3.3 — Configurar Twilio de la subcuenta del cliente (20 min)
1. Si el cliente YA tiene WhatsApp Business API: pedir el número, registrarlo como Sender
2. Si NO tiene: usar el Sandbox de Twilio temporalmente (`+14155238886`)
3. Correr `scripts/twilio-setup.mjs` (crea Messaging Service, vincula el número, configura
   webhook y opt-out automáticamente — ver `docs/04-deployment.md` §6 Paso 2)
4. Cargar las credenciales en la fila del tenant (`docs/04-deployment.md` §6 Paso 3)
5. Crear las plantillas de texto (`scripts/twilio-create-text-templates.mjs`) y enviarlas a
   aprobación de Meta (tarda 24-72h)

**Acción en Notion:** Marcar checkbox `Twilio configurado`, estado → `En setup — Esperando aprobación Meta`

### Paso 3.4 — Dominio en Vercel (10 min)
Seguir `docs/04-deployment.md` §6 Paso 4: agregar el subdominio en Settings → Domains del
proyecto compartido, crear el registro DNS, y una vez propague hacer el `UPDATE tenants SET domain = ...`.

**Acción en Notion:** Marcar checkbox `Dominio configurado`. Pegar la URL final.

### Paso 3.5 — Usuario admin (5 min)
Invite user en Supabase Auth + tagear `tenant_id` en su JWT (`docs/04-deployment.md` §6 Paso 5).
Enviarle una contraseña temporal por WhatsApp.

**Acción en Notion:** Marcar checkbox `Usuario admin creado`

### Paso 3.6 — Configurar recompensas en el dashboard (15 min)
1. Ir a `https://[subdominio-del-cliente]/login`
2. Loguearse con el admin creado
3. Dashboard → Recompensas → Crear tiers:
   - Bronce: 150 pts → [premio que eligió el cliente]
   - Plata: 350 pts → [premio]
   - Oro: 600 pts → [premio]
   - BLACK: 1000 pts → [premio]
4. Dashboard → Ajustes → Configurar puntos por visita (40-65 recomendado)

**Acción en Notion:** Marcar checkbox `Recompensas configuradas`

### Paso 3.7 — Generar e imprimir QRs (20 min)
1. Dashboard → QR → Subir logo del restaurante
2. Seleccionar color de marca
3. Generar QR por cada mesa (o uno general si prefiere)
4. Descargar PNGs
5. Enviar a imprenta o imprimir en casa (tamaño recomendado: 10x10cm, plastificado)

**Acción en Notion:** Marcar checkbox `QRs generados`. Subir los PNGs a la carpeta del cliente.

### Paso 3.8 — Prueba end-to-end (20 min)
Seguir `docs/04-deployment.md` §6 Paso 9 (incluye probar que el auto-reply usa la marca de ESTE
tenant y que el flujo de domicilios por WhatsApp del mesero no da 404).

**Acción en Notion:** Marcar checkbox `Prueba end-to-end OK`. Si falla, crear nota con el error.

### Paso 3.9 — Capacitación al admin del restaurante (30-45 min)
1. Llamada o visita presencial
2. Mostrar:
   - Cómo ver clientes registrados
   - Cómo ver visitas de hoy
   - Cómo enviar una campaña manual
   - Cómo cambiar recompensas
   - Dónde ver cuántos mensajes le quedan (billetera Twilio)
3. Dejarle un manual impreso o PDF (puedes generar uno simple de 1 página)

**Acción en Notion:** Estado → `Cliente activo`. Fecha de activación.

---

## Fase 4: Cliente Activo (Mensual)

**Quién lo hace:** Tú (gestión) + asistente (si tienes)
**Duración:** 30 min/mes por cliente
**Objetivo:** Mantener al cliente contento y pagando

### Tareas mensuales
- [ ] Revisar dashboard del cliente: ¿cuántos clientes nuevos este mes? ¿cuántas visitas?
- [ ] Verificar saldo Twilio (si está bajo, avisar al cliente para recargar)
- [ ] Enviar reporte mensual simple (puede ser un screenshot del dashboard con un mensaje de WhatsApp)
- [ ] Revisar si hay plantillas de Meta por vencer o rechazadas
- [ ] Cobrar mensualidad (si es recurrente)

### Tareas trimestrales
- [ ] Llamada de check-in con el dueño: "¿Está viendo resultados? ¿Necesita ajustar las recompensas?"
- [ ] Proponer mejoras: campañas manuales, eventos del calendario, etc.

---

## Fase 5: Offboarding (si se va)

**Quién lo hace:** Tú
**Objetivo:** Terminar limpio, dejar puerta abierta

1. Exportar los clientes de ESE tenant (CSV desde Supabase, `SELECT * FROM customers WHERE tenant_id = '...'`)
2. Entregar CSV al dueño ("aquí está tu lista de clientes")
3. `UPDATE tenants SET is_active = false WHERE slug = '...'` — con esto sale automáticamente de
   birthday/reactivation (loop de tenants activos) y `getTenantByDomain()` deja de resolverlo
4. Quitar su dominio de Vercel (Settings → Domains) — el proyecto compartido sigue igual para
   los demás clientes
5. Cancelar/liberar su subcuenta Twilio
6. Mover en Notion: Estado → `Cancelado / Inactivo`

---

## Resumen visual del pipeline

```
Lead nuevo → Reunión agendada → Venta cerrada → Setup (2 días) → Cliente activo
     ↑                                                              │
     └──────────────── Seguimiento / Reactivación ←──────────────┘
```

---

## Notas para el operador (tú o tu asistente)

- **NO improvises.** Si un paso no está aquí, no lo hagas. Pregunta primero.
- **Si algo técnico falla y no sabes qué es:** Crear un ticket en Notion con el error exacto y asignarlo a desarrollo.
- **El setup debe hacerse en máximo 48h después del pago.** Si se demora más, el cliente pierde confianza.
- **Siempre enviar actualización al cliente cada 24h durante el setup:** "Hoy hicimos X, mañana terminamos Y."
