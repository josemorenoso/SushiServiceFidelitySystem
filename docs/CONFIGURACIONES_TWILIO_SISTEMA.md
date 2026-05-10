# Configuraciones Twilio — Sistema de Fidelización

> **Última actualización:** 2026-05-09
> **Versión:** 2.0 — Sistema Dopamínico con Niveles
> **Objetivo:** Documentar la configuración completa de Twilio y la lógica de recompensas y comunicación que hace que este sistema justifique un precio high ticket para el restaurante.

---

## Tabla de Contenidos

1. [Cuentas y números necesarios](#1-cuentas-y-números-necesarios)
2. [Variables de entorno](#2-variables-de-entorno)
3. [Opt-Out automático](#3-opt-out-automático)
4. [Auto-respondedor anti-idiotas](#4-auto-respondedor-anti-idiotas)
5. [Sistema de Niveles y Recompensas](#5-sistema-de-niveles-y-recompensas) ⭐
6. [Plantillas WhatsApp — Nueva arquitectura](#6-plantillas-whatsapp--nueva-arquitectura) ⭐
7. [Webhook de domicilios](#7-webhook-de-domicilios)
8. [Cron jobs](#8-cron-jobs)
9. [Por qué este sistema justifica high ticket](#9-por-qué-este-sistema-justifica-high-ticket)
10. [Checklist de activación por cliente](#10-checklist-de-activación-por-cliente)

---

## 1. Cuentas y números necesarios

### 1.1 Infraestructura necesaria

| Servicio | Para qué | Costo aprox |
|----------|----------|-------------|
| **Twilio** | Envío/recepción WhatsApp + Content API | ~$0.0058/msg MARKETING, ~$0.003/msg UTILITY |
| **Meta WhatsApp Business** | Aprobación de plantillas | Gratis (Twilio lo gestiona) |
| **Vercel** | Hosting de la app | Gratis (plan Hobby) |
| **Supabase** | Base de datos PostgreSQL | Gratis hasta 500MB |

### 1.2 DOS números obligatorios (CRÍTICO)

| Número | Función | Quién responde |
|--------|---------|----------------|
| **Twilio WhatsApp** | Envío automático de plantillas + recepción redirigida | Nadie humano — solo el sistema |
| **WhatsApp del Restaurante** | Atención en vivo, pedidos, dudas | Staff del restaurante |

⚠️ Mezclar ambos en el mismo número genera caos operativo. Son roles distintos.

---

## 2. Variables de entorno

```bash
# ─── Supabase ───
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# ─── Twilio (línea automática) ───
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+573XXXXXXXXX

# ─── Restaurante (línea humana) ───
RESTAURANT_WHATSAPP_LINK=https://wa.me/573XXXXXXXXX

# ─── Branding ───
NEXT_PUBLIC_BRAND_NAME=Nombre del Restaurante
NEXT_PUBLIC_BRAND_SHORT=NR
NEXT_PUBLIC_BRAND_TAGLINE=Tu programa de fidelidad

# ─── Seguridad ───
CRON_SECRET=random-32-chars
WEBHOOK_DELIVERY_SECRET=random-32-chars

# ─── n8n ───
N8N_BASE_URL=https://n8n.tudominio.com
N8N_GOOGLE_CONTACTS_WEBHOOK_URL=https://n8n.tudominio.com/webhook/...

# ─── Opcionales ───
NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL=https://g.page/r/...
```

---

## 3. Opt-Out automático

### 3.1 Cómo funciona

Cuando un cliente responde **STOP, BAJA, CANCELAR** al número Twilio:

1. Twilio bloquea ese número automáticamente.
2. Futuros envíos devuelven error **21610** (opted out).
3. El bloqueo se levanta cuando el cliente escribe **START, ALTA, ACEPTO**.

### 3.2 Configuración en Twilio Console

**Twilio Console → Messaging → Settings → Opt-Out Management**

| Sección | Keywords a agregar |
|---------|-------------------|
| Opt-out | `BAJA, CANCELAR, FUERA, BASTA` |
| Opt-in | `ALTA, ACEPTO, QUIERO` |
| Help | `AYUDA, INFO` |

STOP en inglés ya está activado por defecto — no hace falta agregarlo.

### 3.3 Obligación legal Meta

Toda plantilla **MARKETING** debe incluir en el cuerpo:
```
Para no recibir más mensajes responde STOP.
```
Sin esta línea Meta rechaza la plantilla. Las plantillas **UTILITY** (transaccionales) están exentas.

---

## 4. Auto-respondedor anti-idiotas

### 4.1 El problema

El número Twilio envía mensajes automáticos. Los clientes responden cosas como "hola", "gracias", "¿dónde quedan?". Eso abre la ventana de 24h de WhatsApp Business sin nadie que la atienda → cliente frustrado.

### 4.2 Solución

Webhook en `/api/webhook/twilio-incoming` que detecta la intención del mensaje y responde redirigiendo al número humano del restaurante con un link `wa.me/...` de un solo tap.

### 4.3 Detección de intención

| Intención | Keywords | Respuesta |
|-----------|----------|-----------|
| Pedido/domicilio | pedido, domicilio, delivery, ordenar | Redirige + contexto de pedidos |
| Horario | horario, abierto, abren, cierran | Redirige + mención de horarios |
| Ubicación | dirección, dónde, queda, ubicación | Redirige + mención de ubicación |
| Default | cualquier otro mensaje | Redirige con mensaje genérico amable |

STOP/BAJA los intercepta Twilio antes — nunca llegan al webhook.

### 4.4 Configurar webhook en Twilio Console

**Twilio Console → Messaging → Senders → WhatsApp Senders → [tu número] → "When a message comes in"**

- URL: `https://tu-app.vercel.app/api/webhook/twilio-incoming`
- Método: HTTP POST

O via Messaging Service (recomendado): vincular el número al Messaging Service que ya tiene la URL configurada.

---

## 5. Sistema de Niveles y Recompensas

> Esta es la sección más importante del sistema. Define la psicología de retención.

### 5.1 Por qué este diseño y no otro

**El error clásico:** recompensa cada 5-6 visitas. El cliente llega a la 2ª visita sin recibir nada y no vuelve. El 60% de clientes nuevos abandona después de la primera visita en restaurantes sin sistema de fidelización.

**El principio dopamínico:** el cerebro humano se engancha más rápido cuando recibe recompensas frecuentes al inicio y luego pasa a un esquema de refuerzo variable. Es exactamente el mismo mecanismo que hace que los videojuegos sean adictivos.

**Regla base:**
- Visitas 1, 2 y 3: premio garantizado en CADA visita → enganche
- A partir de la visita 4: premio cada 2 visitas → anticipación sostenida
- Cada 3 visitas: sube de nivel → identidad y orgullo

### 5.2 Niveles

| Nivel | Visitas | Ícono | Mensaje de identidad |
|-------|:-------:|:-----:|:---------------------|
| **Plata** | 1 – 3 | 🥈 | "Bienvenido a la familia" |
| **Oro** | 4 – 6 | 🥇 | "Ya eres parte de nuestro círculo" |
| **Diamante** | 7 – 9 | 💎 | "Eres uno de nuestros clientes más especiales" |
| **Black** | 10+ | ⚫ | "Acceso VIP permanente" |

El cliente sube de nivel automáticamente al alcanzar la visita 4, 7 y 10. Cada subida de nivel tiene su propio mensaje especial y una recompensa de bienvenida al nuevo nivel.

### 5.3 Calendario de Recompensas

> Los títulos son sugeridos. El dueño los personaliza en Dashboard → Recompensas.

| Visita | Premio sugerido | Nivel | Nota estratégica |
|:------:|:----------------|:-----:|:-----------------|
| **1** | 🥤 Bebida de bienvenida gratis | 🥈 Plata | Sorpresa inmediata — el cliente no lo espera |
| **2** | 🍮 Postre gratis | 🥈 Plata | Refuerza el hábito antes de que desaparezca |
| **3** | 🎟️ 15% de descuento | 🥈 Plata | Pico dopamínico — valor económico real |
| 4 | *(sin premio)* | 🥇 Oro | Mensaje comunica: "en tu próxima visita tienes X" |
| **5** | 🍽️ Entrada o aperitivo gratis | 🥇 Oro | Premio después de la espera — muy valorado |
| 6 | *(sin premio)* | 🥇 Oro | Urgencia: "próxima visita = nivel Diamante + premio" |
| **7** | 🏆 Plato principal gratis | 💎 Diamante | Premio de bienvenida al nivel — hito emocional |
| 8 | *(sin premio)* | 💎 Diamante | |
| **9** | 🍻 2x1 en cualquier plato | 💎 Diamante | Premio social — trae acompañante → 2x ingresos |
| 10 | *(sin premio — sube a Black)* | ⚫ Black | La entrada al Black ES el premio |
| **11** | 🎟️ 25% de descuento | ⚫ Black | |
| 12 | *(sin premio)* | ⚫ Black | |
| **13** | 🍾 Botella / bebida premium gratis | ⚫ Black | Exclusividad percibida |
| 14 | *(sin premio)* | ⚫ Black | |
| **15** | 🍽️🥂 Cena para dos | ⚫ Black | Premio aspiracional — boca a boca garantizado |
| ...y así, cada 2 visitas | | ⚫ Black | El dueño define los premios Black |

### 5.4 Economía de las recompensas (justificación al dueño)

Con ticket promedio de $60,000 COP y **margen de contribución del 20% = $12,000 COP por visita**:

| Premio | Costo real al restaurante | Visita que genera | Utilidad de esa visita | ROI |
|--------|:-------------------------:|:-----------------:|:----------------------:|:---:|
| Bebida gratis | ~$3,000 COP | $60,000 COP | $12,000 COP | **4x** |
| Postre gratis | ~$4,000 COP | $60,000 COP | $12,000 COP | **3x** |
| 15% descuento | ~$9,000 COP | $51,000 COP | $10,200 COP | **1.1x + fidelización** |
| Plato principal | ~$12,000 COP | $60,000 COP | $12,000 COP | **1x + nivel Diamante** |
| 2x1 | ~$15,000 COP | $120,000 COP (dos personas) | $24,000 COP | **1.6x + cliente nuevo** |

> **Conclusión:** ningún premio pierde dinero si trae al cliente. El único escenario de pérdida es que el cliente reclame el premio sin consumir nada más, lo cual no ocurre en práctica (siempre piden algo adicional).

### 5.5 Pendiente no urgente — configuración por el dueño

> **TODO (baja prioridad):** Agregar en Dashboard → Ajustes la opción de que el dueño configure cada cuántas visitas sube de nivel (actualmente fijo en 3). Útil para restaurantes con tickets muy altos que prefieren umbrales en visita 5, 10, 20.

---

## 6. Plantillas WhatsApp — Nueva arquitectura

### 6.1 De 7 a 6 plantillas con mayor impacto

| # | Nombre | Categoría | Cuándo se usa |
|---|--------|:---------:|:--------------|
| 1 | `bienvenida_primera_visita` | UTILITY | Primera visita: registro nuevo |
| 2 | `visita_con_premio` | UTILITY | Visita con recompensa ganada (sin subida de nivel) |
| 3 | `subida_de_nivel` | UTILITY | Visita donde el cliente sube de nivel (visitas 4, 7, 10) |
| 4 | `visita_sin_premio` | MARKETING | Visita sin recompensa — urgencia hacia la siguiente |
| 5 | `feliz_cumpleanos` | UTILITY | Cron de cumpleaños |
| 6 | `reactivacion` | MARKETING | Cron de reactivación (21+ días sin visita) |

> Las antiguas plantillas near/far se reemplazan con las plantillas 2, 3 y 4 que comunican información específica y accionable en lugar de mensajes vagos.

---

### 6.2 Estructura de los mensajes: las 4 capas

Cada mensaje post-visita debe activar 4 disparadores psicológicos:

```
[CAPA 1] Confirmación + celebración → "fuiste, eso importa"
[CAPA 2] Estado actual (premio ganado o visitas acumuladas) → "hay algo para ti"
[CAPA 3] Premio ESPECÍFICO de la próxima visita → URGENCIA
[CAPA 4] Progreso de nivel → IDENTIDAD
```

La clave está en que el cliente **siempre se vaya con algo pendiente de reclamar**. No es "vuelve pronto". Es "en tu próxima visita tienes [X] esperándote".

---

### 6.3 Plantilla 1 — `bienvenida_primera_visita`
**Categoría:** UTILITY | **Variables:** `{{1}}`=nombre, `{{2}}`=premio_siguiente_visita

```
¡Hola {{1}}! 🎉 Bienvenid@ a nuestra familia.

Acabas de unirte al programa y ya tienes algo esperándote:

🎁 En tu PRÓXIMA visita: {{2}}

¡No lo dejes ir! Te esperamos pronto. 🥈 Nivel Plata activado.
```

> **Por qué funciona:** La primera visita termina con una promesa específica. El cliente sabe exactamente qué gana si regresa. Elimina el "¿para qué volver?".

---

### 6.4 Plantilla 2 — `visita_con_premio`
**Categoría:** UTILITY | **Variables:** `{{1}}`=nombre, `{{2}}`=num_visita, `{{3}}`=bloque_premio_progreso

```
¡Hola {{1}}! 🏆 Visita #{{2}} — ¡ganaste!

{{3}}
```

Donde `{{3}}` se construye dinámicamente:
```
🎁 GANASTE: [título del premio]
📲 Muéstralo en tu PRÓXIMA visita para reclamarlo.

👉 Visita [N+2]: [próximo premio específico]
📊 Nivel: [ícono] [nombre nivel] — [N] visitas para [siguiente nivel]
```

**Ejemplo real — visita #2 (postre gratis):**
```
¡Hola María! 🏆 Visita #2 — ¡ganaste!

🎁 GANASTE: Postre gratis 🍮
📲 Muéstralo en tu PRÓXIMA visita para reclamarlo.

👉 Visita 3: 15% de descuento te espera 🎟️
📊 Nivel: 🥈 Plata — 1 visita para 🥇 Oro
```

---

### 6.5 Plantilla 3 — `subida_de_nivel`
**Categoría:** UTILITY | **Variables:** `{{1}}`=nombre, `{{2}}`=num_visita, `{{3}}`=bloque_nivel

```
¡Hola {{1}}! ⭐ Visita #{{2}} — ¡subiste de nivel!

{{3}}
```

Donde `{{3}}`:
```
[ícono] NUEVO NIVEL: [nombre nivel]
🏆 Premio de bienvenida: [título del premio]
📲 Reclámalo en tu próxima visita.

Lo que viene en [nombre nivel]:
→ Visita [X]: [premio]
→ Visita [Y]: [premio]
```

**Ejemplo real — visita #7 (sube a Diamante + plato gratis):**
```
¡Hola María! ⭐ Visita #7 — ¡subiste de nivel!

💎 NUEVO NIVEL: Diamante
🏆 Premio de bienvenida: Plato principal gratis 🍽️
📲 Reclámalo en tu próxima visita.

Lo que viene en Diamante:
→ Visita 9: 2x1 en cualquier plato 🍻
→ Visita 10: ¡Acceso al nivel Black! ⚫
```

---

### 6.6 Plantilla 4 — `visita_sin_premio`
**Categoría:** MARKETING | **Variables:** `{{1}}`=nombre, `{{2}}`=num_visita, `{{3}}`=bloque_urgencia

```
¡Hola {{1}}! 👋 Visita #{{2}} anotada.

{{3}}

Para no recibir más mensajes responde STOP.
```

Donde `{{3}}`:
```
🎯 PRÓXIMA VISITA: [título del próximo premio]
No lo dejes pasar — te lo guardamos.

📊 Nivel: [ícono] [nombre] — [N] visitas para [siguiente nivel]
✨ En camino: [premio 2 visitas] → [premio de subida de nivel]
```

**Ejemplo real — visita #4 (sin premio, acaba de subir a Oro):**
```
¡Hola María! 👋 Visita #4 anotada.

🎯 PRÓXIMA VISITA: Entrada gratis 🍽️
No lo dejes pasar — te lo guardamos.

📊 Nivel: 🥇 Oro — 3 visitas para 💎 Diamante
✨ En camino: Entrada (#5) → Plato principal gratis (#7)

Para no recibir más mensajes responde STOP.
```

---

### 6.7 Plantilla 5 — `feliz_cumpleanos`
**Categoría:** UTILITY | **Variables:** `{{1}}`=nombre, `{{2}}`=nivel_actual

```
¡Feliz cumpleaños {{1}}! 🎂

Hoy es tu día y queremos celebrarlo contigo.
Pasa hoy por [RESTAURANTE] y reclama tu sorpresa de cumpleaños. 🎁

Te esperamos. Eres nuestro cliente {{2}} y eso lo celebramos. ✨
```

---

### 6.8 Plantilla 6 — `reactivacion`
**Categoría:** MARKETING | **Variables:** `{{1}}`=nombre, `{{2}}`=nivel_actual, `{{3}}`=bloque_regreso

```
Hola {{1}} 👋 Te echamos de menos.

{{3}}

Para no recibir más mensajes responde STOP.
```

Donde `{{3}}` varía según si hay regalo de reactivación configurado:

**Sin regalo:**
```
Hace tiempo que no te vemos. Tu nivel {{2}} te sigue esperando,
y con él, los premios que tienes por reclamar.

¿Volvemos? 🍽️
```

**Con regalo:**
```
Tu nivel {{2}} te extraña. Y para que vuelvas,
te tenemos un regalo esperándote:
🎁 [título del regalo]
Pasa esta semana y reclámalo. ¡Te esperamos!
```

---

### 6.9 Lógica de selección de plantilla (motor de decisión)

```
DADO visita_numero y total_visitas del cliente:

  SI es la primera visita del cliente (total = 1):
    → Plantilla 1 (bienvenida)
    → {{2}} = título del premio de la visita 2

  SI visita_numero es umbral de nivel (4, 7, 10):
    → Plantilla 3 (subida_de_nivel)
    → {{3}} = nuevo nivel + premio de bienvenida + preview próximos 2 premios

  SI existe premio para visita_numero:
    → Plantilla 2 (visita_con_premio)
    → {{3}} = premio_hoy + próximo_premio_específico + nivel + distancia_al_siguiente

  SI NO existe premio para visita_numero:
    → Plantilla 4 (visita_sin_premio)
    → {{3}} = próximo_premio_específico (con urgencia) + nivel + preview próximos 2
```

---

### 6.10 Asignación en Dashboard → Ajustes

Una vez aprobadas por Meta (24-48h):

| Selector | Plantilla |
|----------|-----------|
| Bienvenida (primera visita) | 1 — `bienvenida_primera_visita` |
| Visita con premio | 2 — `visita_con_premio` |
| Subida de nivel | 3 — `subida_de_nivel` |
| Visita sin premio | 4 — `visita_sin_premio` |
| Cumpleaños | 5 — `feliz_cumpleanos` |
| Reactivación | 6 — `reactivacion` |
| Recompensa para reactivación con regalo | (seleccionar un reward activo) |

---

## 7. Webhook de domicilios

### 7.1 Flujo

Mesero reenvía mensaje de pedido al número Twilio → Twilio dispara webhook → sistema detecta si el remitente está en `authorized_numbers` → si SÍ, reenvía a n8n para parseo → si NO, responde con auto-redirect anti-idiotas.

### 7.2 Configurar números autorizados

En **Supabase → SQL Editor**:

```sql
INSERT INTO authorized_numbers (phone, name, is_active) VALUES
  ('573001234567', 'Mesero Juan', true),
  ('573009876543', 'Mesero Pedro', true);
```

---

## 8. Cron jobs

### 8.1 Horarios recomendados

| Cron | Hora Colombia | Cron UTC | Por qué |
|------|:-------------:|:--------:|:--------|
| Cumpleaños | 8:00 AM | `0 13 * * *` | El cliente lo recibe al despertar |
| Reactivación | 10:00 AM | `0 15 * * *` | Hora de mayor apertura de WhatsApp |

### 8.2 Configuración en `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/birthday", "schedule": "0 13 * * *" },
    { "path": "/api/cron/reactivation", "schedule": "0 15 * * *" }
  ]
}
```

### 8.3 Variable requerida

```bash
CRON_SECRET=random-32-chars
```

---

## 9. Por qué este sistema justifica high ticket

### 9.1 El problema que resuelve

Un restaurante promedio pierde el **60% de clientes nuevos después de su primera visita**. Sin sistema: el cliente viene, consume y desaparece. El dueño no tiene forma de saber quién es, cuándo volverá ni cómo traerlo de vuelta.

Este sistema convierte ese 60% de fuga en un flujo de retención activa.

### 9.2 El retorno económico real

Con ticket promedio **$60,000 COP** y margen de contribución **20% = $12,000 COP/visita**:

| Escenario | Número | Utilidad generada |
|-----------|:------:|:-----------------:|
| 50 clientes reactivados/mes (cron 21 días) | × $12,000 | **$600,000 COP** |
| 30 clientes que pasan de 1 a 2 visitas/mes | × $12,000 | **$360,000 COP** |
| 20 clientes que traen acompañante (2x1) | × $24,000 | **$480,000 COP** |
| **Total incremental mensual** | | **$1,440,000 COP** |
| Costo suscripción | | $149,000 COP |
| **Retorno neto** | | **$1,291,000 COP = 9.6x ROI** |

> Estos números son conservadores. Un restaurante con 300+ clientes activos ve retornos de 15-20x.

### 9.3 Lo que el sistema hace solo (sin intervención del dueño)

- ✅ Cliente nuevo → bienvenida + promesa del próximo premio automática
- ✅ Cada visita → mensaje con premio específico pendiente → urgencia de regreso
- ✅ Subida de nivel → hito emocional con preview de beneficios exclusivos
- ✅ Día 21 sin visita → reactivación personalizada automática
- ✅ Cumpleaños → mensaje sorpresa que genera visita garantizada
- ✅ Cliente responde al número → redirigido sin fricción al humano

---

## 10. Checklist de activación por cliente

### Técnico (Día 1 — 2-3 horas)
- [ ] Crear proyecto Supabase + ejecutar 10 migraciones SQL
- [ ] Crear usuario admin en Supabase Auth
- [ ] Fork del repo → nuevo repo GitHub → deploy en Vercel
- [ ] Configurar todas las variables de entorno en Vercel → Redeploy
- [ ] Crear Messaging Service en Twilio + vincular número WhatsApp al servicio
- [ ] Configurar webhook URL en Messaging Service
- [ ] Configurar opt-out keywords en español en Twilio Console

### Plantillas (Día 2 — 1 hora + 24-48h espera Meta)
- [ ] Crear las 6 plantillas en Twilio Content API
- [ ] Personalizar nombre del restaurante en cada plantilla
- [ ] Marcar categoría correcta (UTILITY vs MARKETING)
- [ ] Enviar a aprobación → esperar respuesta de Meta

### Dashboard (Día 3 — 30 min)
- [ ] Recompensas: cargar el sistema sugerido o crear milestones personalizados
- [ ] Ajustes: asignar los 6 SIDs de plantillas aprobadas
- [ ] Ajustes: seleccionar recompensa para reactivación con regalo
- [ ] Ajustes: configurar ticket promedio

### Pruebas E2E (Día 4)
- [ ] Escanear QR con celular personal → registrarse → recibir bienvenida con premio prometido
- [ ] Repetir hasta visita 3 → verificar mensajes de premio correcto cada vez
- [ ] Visita 4 → verificar subida a Oro + mensaje de urgencia hacia visita 5
- [ ] Responder "hola" al número Twilio → verificar redirect a número humano
- [ ] Responder "STOP" → verificar que no llegan más mensajes

### Operación (Día 5)
- [ ] Capacitar staff: el QR se escanea al llegar, no al salir
- [ ] Imprimir y plastificar QRs por mesa
- [ ] Entregar acceso al dashboard al dueño
- [ ] Monitorear primeras 50 visitas

---

## Referencias

- Twilio Content API: https://www.twilio.com/docs/content
- Twilio WhatsApp: https://www.twilio.com/docs/whatsapp
- Opt-Out Management: https://www.twilio.com/docs/messaging/features/how-to-configure-opt-in-keywords
- Meta plantillas: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
- WhatsApp wa.me: https://faq.whatsapp.com/5913398998672934
