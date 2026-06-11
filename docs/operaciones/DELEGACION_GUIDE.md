# Guía de Delegación — Qué puedes darle a un asistente YA

> Tareas delegables HOY. Con instrucciones exactas, nivel de riesgo, y cuánto pagarle.

---

## Perfil del asistente

- **NO necesitas:** Programador, experto en Supabase, ingeniero.
- **SÍ necesitas:** Organizado, paciente con checklists, sabe usar internet, escribe bien en español.
- **Dónde:** Facebook Groups AV Colombia, referidos, LinkedIn.
- **Pago sugerido:** $1.5M - $2.5M COP/mes medio tiempo.

---

## TAREA 1: Registrar leads en Notion

**Qué hace:** Cuando alguien te contacta por IG/WhatsApp/referido, crea la entrada.

**Instrucciones exactas:**
1. Abrir Notion → "Leads y Clientes"
2. Click "Nuevo"
3. Llenar: Nombre del restaurante, Nombre del dueño, Celular, Fuente (Instagram/Referido/Frío)
4. Estado = "Lead nuevo"
5. Fecha de contacto = hoy
6. Asignado a = [tu nombre]

**Tiempo:** 2 min por lead | **Riesgo:** BAJO

---

## TAREA 2: Primer mensaje a leads (script exacto)

**Instrucciones:**
1. Filtrar Notion → Estado = "Lead nuevo"
2. Enviar por WhatsApp (copiar, pegar, reemplazar [Nombre]):

```
Hola [Nombre], soy [tu nombre] de RestaurantQR.

Ayudamos a restaurantes como [Nombre restaurante] a que sus clientes vuelvan más seguido con fidelidad por WhatsApp — sin apps, sin tarjetas.

¿Tienes 15 min esta semana para que te muestre cómo funciona?
```

3. Cambiar Estado a "Primer contacto enviado"
4. Agregar nota: "Seguimiento en 3 días"

**Tiempo:** 5 min por lead | **Riesgo:** BAJO

---

## TAREA 3: Recopilar datos del cliente (después del cierre)

**Mensaje exacto para enviar al dueño:**

```
¡Hola [Nombre]! Feliz de que empecemos 🎉

Para configurar tu sistema necesito que me envíes:

1. Logo del restaurante (PNG, sin fondo si es posible)
2. Colores de tu marca (hex o decime cuáles son)
3. ¿Cuántas mesas tienes?
4. ¿Qué número de WhatsApp usarás para mensajes a clientes?
5. ¿Cuántos clientes atiendes al mes aprox?
6. ¿Tienes link de Google Maps? (para reseñas)
7. ¿Qué recompensas quieres dar? (ej: visita 3 = bebida gratis)
8. Precio promedio del ticket

Cuando me envíes todo, en 48h tu sistema está listo.
```

**Organización:**
- Crear carpeta en Drive/Notion: "Clientes / [Nombre]"
- Llenar tabla con cada dato que llega
- Si no responde en 24h → seguimiento: "Hola, ¿tuviste chance de revisar la lista?"

**Tiempo:** 45 min por cliente | **Riesgo:** BAJO

---

## TAREA 4: Crear cuentas (Supabase, Twilio, Vercel)

**Requiere:** Email dedicado del asistente (NO tu email personal).

### Supabase (15 min)
1. Ir a supabase.com → Sign up → New Project
2. Nombre: `fidelity-[nombre-restaurante]`
3. Region: `us-east-1`
4. Guardar contraseña en Notion (campo seguro)
5. Esperar a que cree
6. Settings → API → copiar `Project URL` y `anon public`
7. Pegarlos en Notion → base "Inventario de Clientes Activos"

### Twilio (15 min)
1. Ir a twilio.com/try-twilio → Sign up
2. Verificar email y teléfono
3. Console → copiar `Account SID` y `Auth Token`
4. Pegar en Notion
5. Si el cliente tiene WhatsApp Business API: pedir número y agregar como sender
6. Si NO tiene: usar Sandbox temporalmente

### Vercel (10 min)
1. Ir a vercel.com → Sign up (con GitHub)
2. No hacer nada más aquí — tú harás el deploy técnico
3. Solo crear la cuenta y pasar login al asistente para que pueda acceder después

**Tiempo:** 40 min por cliente | **Riesgo:** MEDIO (si se equivoca en credenciales, se regeneran)

---

## TAREA 5: Ejecutar migraciones SQL

**Instrucciones exactas:**
1. Abrir Supabase del cliente → SQL Editor → New query
2. Abrir archivo `supabase/migrations/00001_initial_schema.sql` del repo
3. Copiar TODO el contenido
4. Pegar en el SQL Editor de Supabase
5. Click "Run"
6. Repetir para cada migración en orden: 00002, 00003, 00004, etc.
7. Verificar que dice "Success" en cada una

**Si falla:** Copiar el error exacto, pegarlo en Notion en la nota del cliente, y marcar como bloqueado. NO intentar arreglarlo solo.

**Tiempo:** 15 min por cliente | **Riesgo:** MEDIO-BAJO

---

## TAREA 6: Crear usuario admin en Supabase

**Instrucciones exactas:**
1. Supabase del cliente → Authentication → Users
2. Click "Invite user"
3. Email del dueño del restaurante (el que te dio)
4. Contraseña temporal: generar en passwordsgenerator.net (12 caracteres)
5. Guardar email y contraseña en Notion (campo seguro)
6. Enviar por WhatsApp al dueño: "Tu login: [email] / Clave temporal: [password]. La cambias al entrar."

**Tiempo:** 5 min | **Riesgo:** BAJO

---

## TAREA 7: Subir logo y personalizar branding

**Instrucciones exactas:**
1. Recibir logo del cliente (PNG)
2. Si no es PNG o tiene fondo: usar remove.bg (gratis) para quitar fondo
3. Renombrar como `logo.png`
4. Subir al repo del cliente en `public/logo.png`
5. Commit con mensaje: "chore: add client logo"

**Tiempo:** 10 min | **Riesgo:** BAJO

---

## TAREA 8: Crear plantillas de WhatsApp (usando script)

**Instrucciones exactas:**
1. Abrir terminal en la carpeta del repo del cliente
2. Ejecutar: `node scripts/twilio-create-text-templates.mjs`
3. Si pide credenciales, usar las que están en Notion (Account SID, Auth Token, número From)
4. Esperar a que termine — debe decir "11 templates created"
5. Copiar los SIDs que devuelve y pegarlos en Notion
6. Marcar en Notion: "Plantillas creadas — esperando aprobación Meta"

**Tiempo:** 10 min | **Riesgo:** MEDIO (si falla, revisar credenciales)

---

## TAREA 9: Generar e imprimir QRs

**Instrucciones exactas:**
1. Ir al dashboard del cliente → `/dashboard/qr`
2. Subir logo del restaurante
3. Seleccionar color de marca
4. Generar 1 QR por mesa (o 1 QR general si prefiere)
5. Descargar cada QR como PNG
6. Subir PNGs a Drive/Notion → carpeta del cliente
7. Enviar a imprenta local o imprimir en casa
8. Tamaño recomendado: 10x10cm, plastificado

**Tiempo:** 30 min | **Riesgo:** BAJO

---

## TAREA 10: Seguimiento a clientes activos (mensual)

**Instrucciones exactas:**
1. Abrir Notion → "Seguimiento Mensual"
2. Por cada cliente activo, crear entrada del mes actual
3. Ir al dashboard del cliente → anotar: clientes nuevos este mes, visitas totales
4. Ir a Twilio Console → ver saldo de la cuenta
5. Si saldo < $5 USD: enviar mensaje al dueño: "Hola [Nombre], tu saldo de mensajes está bajo. Para recargar: [link Twilio Billing]"
6. Marcar en Notion: "Reporte enviado" y "Mensualidad cobrada" (si aplica)

**Tiempo:** 20 min por cliente activo | **Riesgo:** BAJO

---

## TAREA 11: Reporte mensual al cliente (mensaje exacto)

```
Hola [Nombre]! 👋

Resumen de tu programa de fidelidad — [Mes]:

🎉 [X] clientes nuevos registrados
🍣 [Y] visitas este mes
📩 [Z] mensajes enviados automáticamente
💰 Tu saldo de mensajes: $[saldo] USD

Todo va bien. ¿Necesitas ajustar algo para el próximo mes?
```

**Tiempo:** 5 min por cliente | **Riesgo:** BAJO

---

## LO QUE NO PUEDE HACER EL ASISTENTE (solo tú)

| Tarea | Por qué |
|-------|---------|
| Cerrar la venta | Requiere tu conocimiento del producto y autoridad de precio |
| Hacer deploy en Vercel (final) | Si falla, necesitas leer logs técnicos |
| Arreglar errores de código | Si una migración SQL falla, es trabajo de dev |
| Cambiar lógica de recompensas | Impacta en el sistema de puntos, requiere entender el producto |
| Configurar webhooks o n8n | Técnico avanzado, puede romper crons |
| Decidir si un cliente se va o se queda | Eso lo decides tú |

---

## Estructura de supervisión semanal

**Reunión de 30 min cada lunes:**
1. Asistente comparte pantalla de Notion
2. Revisar "Bloqueados" — ¿necesitas ayuda en algo?
3. Revisar "Setup pendiente" — ¿qué vence esta semana?
4. Revisar "Leads nuevos" — ¿hay alguno que requiera tu intervención?
5. Revisar "Seguimiento mensual" — ¿algún cliente incómodo?
6. Tú: "Esta semana prioriza X e Y."
7. Asistente: actualiza fechas límite en Notion

---

## Seguridad y credenciales

**Reglas inviolables:**
1. Las credenciales (SID, tokens, keys) van en la base "Inventario de Clientes Activos" de Notion
2. Esa base está en una página privada, NO en la página principal del workspace
3. El asistente tiene acceso de "Can edit" a las bases operativas, "Can view" al inventario técnico
4. NUNCA enviar credenciales por WhatsApp o email
5. Cada 3 meses, rotar tokens (regenerar en Twilio/Supabase y actualizar en Notion)

---

## Checklist para empezar a delegar

- [ ] Contratar al asistente
- [ ] Crear workspace de Notion
- [ ] Crear las 4 bases de datos (ver ESTRUCTURA_NOTION.md)
- [ ] Crear email dedicado para el asistente (ej: ops@restaurantqr.com)
- [ ] Enviarle esta guía (DELEGACION_GUIDE.md) para que lea
- [ ] Hacer una reunión de 1 hora: explicar el producto, mostrar Notion, mostrar un setup completo
- [ ] Darle su primera tarea: registrar los leads que ya tienes
- [ ] Supervisar las primeras 3 tareas de cada tipo antes de soltarlo solo
- [ ] Establecer la reunión semanal de lunes

**Tiempo total de preparación:** 4-5 horas distribuidas en 1 semana.
**Tiempo que te ahorras después:** 15-20 horas/semana.
