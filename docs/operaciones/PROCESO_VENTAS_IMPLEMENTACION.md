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
**Duración:** 3-4 horas distribuidas en 2 días
**Objetivo:** Tener el sistema operativo

### Día 1 — Infraestructura (2 horas)

#### 3.1.1 Recolectar datos del cliente
Crear carpeta en Notion o Drive: `Clientes / [Nombre Restaurante]`

| Dato | Cómo se obtiene |
|------|-----------------|
| Nombre del restaurante | El cliente te lo dice |
| Logo (PNG sin fondo) | Pedirlo. Si no tiene, usar Canva gratis |
| Colores de marca (hex) | Pedirlo o sacar del Instagram del restaurante |
| Número de mesas | Preguntar |
| Número de WhatsApp del negocio | Preguntar. Debe ser un celular real |
| Menú / foto del restaurante | Pedir 2-3 fotos para el QR |
| Precio promedio del ticket | Preguntar (para benchmarks) |
| Redes sociales | Instagram, Google Maps link |
| Recompensas que quiere dar | Ej: visita 3 = bebida gratis, visita 5 = rollo gratis |

**Acción en Notion:** Mover estado a `En setup — Recopilando datos`

#### 3.1.2 Crear proyecto Supabase (20 min)
1. Ir a supabase.com → New Project
2. Nombre: `fidelity-[nombre-restaurante]` (sin espacios)
3. Region: `us-east-1` (más cercano)
4. Guardar contraseña del proyecto en Notion (campo seguro)
5. Esperar a que termine de crear (2 min)
6. Ir a Settings → API → copiar `Project URL` y `anon public`
7. Ir a SQL Editor → New query → pegar las migraciones en orden
8. Ir a Authentication → Users → Invite user → email del admin del restaurante
9. Crear una contraseña temporal, enviársela por WhatsApp

**Acción en Notion:** Marcar checkbox `Supabase creado`

#### 3.1.3 Configurar Twilio (30 min)
1. Ir a twilio.com/console
2. Si el cliente YA tiene WhatsApp Business API: pedir el número, agregarlo como sender
3. Si NO tiene: usar el Sandbox de Twilio temporalmente (`+14155238886`)
4. Crear las 7 plantillas de texto (usar el script `scripts/twilio-create-text-templates.mjs`)
5. Enviarlas a aprobación de Meta (tarda 24-72h)
6. Guardar el `Account SID`, `Auth Token`, y el número `From` en Notion

**Acción en Notion:** Marcar checkbox `Twilio configurado`, estado → `En setup — Esperando aprobación Meta`

#### 3.1.4 Personalizar branding (15 min)
1. Fork del repo base en GitHub
2. Renombrar: `[nombre-restaurante]-fidelity`
3. Editar `.env.example` → poner los datos de Supabase y Twilio
4. Subir logo a `public/logo.png`
5. Editar colores en `tailwind.config.ts` (si aplica)

**Acción en Notion:** Marcar checkbox `Repo creado y branding listo`

### Día 2 — Deploy y Configuración (2 horas)

#### 3.2.1 Deploy en Vercel (20 min)
1. vercel.com → Add New Project → Import Git Repo
2. Seleccionar el repo del cliente
3. Framework: Next.js
4. Agregar las Environment Variables (las que copiaste de Supabase y Twilio)
5. Deploy
6. Guardar la URL: `https://[nombre]-fidelity.vercel.app`

**Acción en Notion:** Marcar checkbox `Deploy en Vercel OK`. Pegar la URL.

#### 3.2.2 Configurar recompensas en el dashboard (15 min)
1. Ir a `[URL]/login`
2. Loguearse con el admin creado en Supabase
3. Dashboard → Recompensas → Crear tiers:
   - Bronce: 150 pts → [premio que eligió el cliente]
   - Plata: 350 pts → [premio]
   - Oro: 600 pts → [premio]
   - BLACK: 1000 pts → [premio]
4. Dashboard → Ajustes → Configurar puntos por visita (40-65 recomendado)

**Acción en Notion:** Marcar checkbox `Recompensas configuradas`

#### 3.2.3 Generar e imprimir QRs (20 min)
1. Dashboard → QR → Subir logo del restaurante
2. Seleccionar color de marca
3. Generar QR por cada mesa (o uno general si prefiere)
4. Descargar PNGs
5. Enviar a imprenta o imprimir en casa (tamaño recomendado: 10x10cm, plastificado)

**Acción en Notion:** Marcar checkbox `QRs generados`. Subir los PNGs a la carpeta del cliente.

#### 3.2.4 Prueba end-to-end (20 min)
1. Con tu celular, escanear un QR
2. Registrar un cliente de prueba (usar un número de prueba, ej: 3000000000)
3. Verificar que llegó el WhatsApp de bienvenida
4. En el dashboard, verificar que aparece la visita
5. Hacer un segundo check-in y verificar que suma puntos
6. Si algo falla → revisar logs en Vercel (Deployments → latest → Logs)

**Acción en Notion:** Marcar checkbox `Prueba end-to-end OK`. Si falla, crear nota con el error.

#### 3.2.5 Capacitación al admin del restaurante (30-45 min)
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

1. Exportar base de datos de clientes del restaurante (CSV desde Supabase)
2. Entregar CSV al dueño ("aquí está tu lista de clientes")
3. Suspender cron jobs (borrar de n8n o desactivar en Vercel)
4. Cancelar proyecto en Twilio (liberar número)
5. Archivar repo en GitHub
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
