# CONTEXTO COMPLETO — Sistema de Fidelización para Restaurantes
# Archivo de referencia para construcción de página web de ventas
# Generado: 2026-05-17 | Versión del sistema: v0.33+

---

## ¿QUÉ ES EL PRODUCTO?

**Nombre comercial sugerido:** Constelarys Fidelity / RestaurantQR  
**Producto:** Plataforma SaaS de fidelización de clientes con automatización WhatsApp para restaurantes en Colombia.

El sistema convierte cada visita presencial y cada domicilio en un punto de contacto que el restaurante **registra automáticamente**, **premia con recompensas** y **reactiva por WhatsApp** — todo sin que el cliente instale ninguna app ni el restaurante necesite personal técnico.

---

## EL PROBLEMA QUE RESUELVE

Los restaurantes en Colombia tienen dos problemas críticos:

1. **No saben quiénes son sus clientes.** El cliente paga, se va, y el restaurante no tiene ni su nombre ni su número. No hay forma de volver a contactarlo.

2. **Los clientes no vuelven solos.** Sin incentivos y sin comunicación, la tasa de retención es baja. Un cliente nuevo cuesta 5x más que fidelizar uno existente.

El sistema resuelve ambos con un QR en la mesa y automatización por WhatsApp.

---

## CÓMO FUNCIONA — FLUJO COMPLETO

### Canal 1: Check-in presencial por QR

1. El restaurante pone un código QR en cada mesa (se genera desde el dashboard).
2. El cliente escanea el QR con la cámara del celular — abre una página web, sin app.
3. Ingresa su número de celular (10 dígitos, formato colombiano 3XXXXXXXXX).
4. **Si es nuevo:** escribe su nombre y fecha de nacimiento → queda registrado.
5. **Si ya existe:** con solo ingresar el número suma una visita.
6. El sistema evalúa automáticamente:
   - ¿Alcanzó un hito de recompensa? → Le envía su premio por WhatsApp.
   - ¿Le falta 1 visita para el próximo premio? → Mensaje de "casi lo tienes" por WhatsApp.
   - ¿Le faltan 2+ visitas? → Mensaje de bienvenida con roadmap de premios por WhatsApp.
7. El cliente ve en pantalla sus visitas, el siguiente premio y un roadmap de beneficios.

**Tiempo total para el cliente: menos de 20 segundos.**

---

### Canal 2: Domicilios por WhatsApp (captura automática)

1. Cliente hace pedido por WhatsApp al restaurante.
2. El mesero **reenvía** ese mensaje a un número de Twilio.
3. El sistema extrae automáticamente con IA (GPT-4o-mini): nombre, número de celular, dirección, método de pago y monto.
4. Crea o actualiza el cliente en la base de datos.
5. Registra la visita como "domicilio".
6. Envía WhatsApp de bienvenida o notificación de premio si aplica.
7. Sincroniza el contacto en Google Contacts del restaurante como backup.

**El cliente de domicilio queda registrado sin hacer nada adicional.**

---

### Canal 3: Automatizaciones programadas (crons diarios)

#### Cron de Cumpleaños (diario)
- Busca clientes cuyo cumpleaños sea hoy.
- Envía mensaje personalizado de WhatsApp de felicitación.
- Solo se envía una vez al año por cliente (control de duplicados).
- El cumpleaños tiene prioridad absoluta — no aplica frequency cap.

#### Cron de Reactivación (diario, día 21)
- Busca clientes que llevan exactamente 21 días sin visitar.
- Envía WhatsApp de reactivación (con o sin premio según configuración).
- Respeta el frequency cap: no molesta a quien recibió mensaje hace menos de 7 días.
- "Zona de recuperación" (días 18-25): las campañas manuales no tocan a estos clientes para que el cron de reactivación los atienda con su mensaje personalizado de mayor conversión.

---

### Canal 4: Campañas manuales segmentadas

Desde el dashboard, el admin puede enviar campañas masivas con filtros por:
- Ciudad
- Rango de visitas (ej: solo clientes con 3 a 7 visitas)
- Canal de origen (QR / domicilios / ambos)
- Edad del cliente (usando fecha de nacimiento)

**Sistema de control de tráfico inteligente:**
- **Frequency cap 7 días:** ningún cliente recibe más de 1 mensaje de marketing cada 7 días (aplica a todos los canales excepto cumpleaños).
- **Recovery Zone:** clientes en los días 18-25 sin visitar se reservan para el cron de reactivación, la campaña manual los salta automáticamente.
- El estimado de audiencia se muestra antes de enviar para que el admin vea exactamente a cuántas personas llegará.

---

## EL SISTEMA DE RECOMPENSAS (GAMIFICACIÓN)

El admin configura hitos de visitas con premios. Ejemplos reales de Sushi Service:
- Visita #2 → Entrada pequeña gratis
- Visita #3 → Soda o gaseosa
- Visita #4 → Postre
- Visita #5 → 1/2 Rollo
- Visita #7 → 10% descuento en la cuenta
- Visita #12 → **Nivel BLACK** (beneficios de por vida)

### Nivel BLACK (tier máximo)
El nivel más alto del programa. Cuando un cliente alcanza el hito BLACK, recibe:
- Premio permanente (ej: descuento de por vida en cada visita)
- Identificación visual especial en el dashboard
- Solo puede existir un hito BLACK activo por restaurante

El cliente ve en su pantalla de check-in el **roadmap completo de premios pendientes**, lo que actúa como motivador de retorno ("me faltan 2 visitas para el postre").

---

## EL DASHBOARD ADMINISTRATIVO

Acceso exclusivo para el admin del restaurante. Incluye:

### Métricas en tiempo real
- Total de clientes registrados
- Nuevos clientes esta semana
- Visitas este mes (QR + domicilios separados)
- Clientes activos / en recuperación / perdidos
- Ticket promedio estimado y ROI calculado

### Visualizaciones
- Gráfica de área: visitas QR vs domicilios en el tiempo
- Gráfica de crecimiento: nuevos clientes + acumulado
- **Heatmap de visitas por hora y día** (zona horaria Colombia)
- **Burbujas de riesgo** interactivas: clientes clasificados por urgencia de reactivación
- **Power Ranking** top 20 clientes (estilo anime)
- Barras de distribución por nivel/tier

### Gestión de clientes
- Lista completa con búsqueda por nombre o teléfono
- Filtros por: canal de origen, nivel de tier, estado (activo / recuperación / perdido)
- Perfil completo de cada cliente: visitas, cumpleaños, historial
- Edición de datos del cliente (nombre, cumpleaños, ciudad)
- Incremento manual de visitas (con envío automático de WhatsApp correspondiente)
- Exportar/importar clientes por CSV

### Campañas
- Lanzar campaña manual con segmentación y estimado previo
- Ver historial: campañas ejecutadas, mensajes enviados, fallos
- Configurar plantillas WhatsApp (crear, sincronizar con Twilio, ver estado de aprobación Meta)

### Configuración
- Definir recompensas por hito de visita
- Asignar plantillas WhatsApp a cada momento (bienvenida, premio, reactivación, cumpleaños)
- Configurar nivel BLACK con sus beneficios
- Ver saldo de Twilio y calculadora de costos de campaña en tiempo real
- Generación y descarga del código QR del restaurante

---

## ARQUITECTURA TÉCNICA (para credibilidad)

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| Frontend + Backend | Next.js 16 (App Router) | Un solo deploy, SSR + API Routes |
| Base de datos | Supabase (PostgreSQL) | RLS, Auth, sin servidor que administrar |
| Mensajería | Twilio SDK + WhatsApp Business API | El estándar industrial para WhatsApp |
| IA de parseo | OpenAI GPT-4o-mini (via n8n) | Extrae datos de pedidos en lenguaje natural |
| Automatización | n8n (VPS propio) | Workflows, Google Contacts, Crons |
| Deploy | Vercel | CDN global, serverless, cero mantenimiento |
| Seguridad | Supabase Auth + RLS + HMAC + Rate Limiting | Datos protegidos a nivel de base de datos |

**Modelo de datos principales:**
- `customers`: phone (único), name, birthday, city, total_visits, last_visit_at, source_channels, last_campaign_at, accepts_marketing
- `visits`: customer_id, source (qr/delivery), notes, created_at
- `rewards`: visit_milestone, title, message_template, is_active, is_black
- `campaigns`: name, type, status, filters (jsonb), total_sent
- `campaign_messages`: campaign_id, customer_id, status, twilio_sid

---

## CAPACIDAD Y ESCALABILIDAD

| Pregunta | Respuesta |
|----------|-----------|
| ¿Cuántos clientes aguanta? | ~1 millón en el plan gratuito de Supabase |
| ¿Cuántos check-ins simultáneos? | 50+ sin problema (restaurante lleno) |
| ¿Cuántos al día? | ~10.000 sin degradación |
| ¿Se cae? | No para el volumen de cualquier restaurante colombiano |
| ¿Cuándo escalar? | Más de 5 restaurantes activos o +1.000 check-ins/día |

**Protecciones ya implementadas:**
- Rate limiting por IP en check-in y webhooks
- Batch paralelo en campañas masivas (evita timeouts)
- Frequency cap y recovery zone centralizados
- Control anti-spam WhatsApp (1 mensaje/7 días por cliente)
- Deduplicación de cumpleaños (1 vez al año)
- Validación de firma HMAC en webhooks de Twilio
- Headers de seguridad HTTP (HSTS, CSP, X-Frame-Options)
- Protección contra check-in duplicado (máximo 1 por día por cliente)

---

## MODELO DE NEGOCIO — CLONE POR CLIENTE

Cada restaurante cliente obtiene:
- **Su propio proyecto Supabase** → datos 100% aislados
- **Su propio proyecto Vercel** → URL propia, deploy independiente
- **Su rama GitHub** → actualizaciones controladas
- **Twilio compartido** → costos de mensajería centralizados en una cuenta

El código es idéntico para todos los clientes. La configuración por cliente va en variables de entorno de Vercel (nombre del restaurante, URL de Google Maps, colores, etc.).

---

## CLIENTE ACTIVO EN PRODUCCIÓN: SUSHI SERVICE

- **Nombre:** Sushi Service
- **URL:** desplegado en Vercel (producción)
- **Branding:** rojo japonés + blanco, icono UtensilsCrossed
- **Email admin:** `admin@sushiservice.com`
- **Estado:** Activo — clientes reales, campañas ejecutadas, Twilio conectado

Prueba que el sistema funciona en producción con un cliente real.

---

## PLANTILLAS WHATSAPP — LOS MENSAJES QUE RECIBE EL CLIENTE

(Todas aprobadas por Meta/WhatsApp Business API, categoría UTILITY para check-in/recompensas)

### Mensaje de bienvenida (registro nuevo)
```
¡Hola [Nombre]! 🎉🍣

Bienvenid@ a la familia de Sushi Service, nos alegra tenerte aquí

Cada visita te acerca a premios reales 👇

[Roadmap de premios]

— El equipo de Sushi Service
```

### Mensaje de recompensa (milestone alcanzado)
```
¡Hola [Nombre]! 🎁❤️

Hoy es tu visita número [N], nos alegra que hayas vuelto

Tienes disponible [Premio], muéstralo para reclamarlo

— El equipo de Sushi Service
```

### Mensaje "cerca del premio" (falta 1 visita)
```
¡Hola [Nombre]! 🔥🍣

Hoy es tu visita número [N], nos alegra que hayas vuelto

Estás a una sola visita de ganar [Premio] — la próxima es tuya 👊

[Roadmap de premios]

— El equipo de Sushi Service
```

### Mensaje de cumpleaños
```
¡Feliz cumpleaños [Nombre]! 🎂🍣

Todo el equipo de Sushi Service te desea un día increíble

Ven a celebrar con nosotros — tienes una sorpresa esperándote

— El equipo de Sushi Service
```

### Mensaje de reactivación (sin premio)
```
¡Hola [Nombre]! 👋🍣

Hace un tiempo que no te vemos y queremos que vuelvas

En Sushi Service siempre hay algo nuevo esperándote 🎯

[Roadmap de premios]

— El equipo de Sushi Service
```

---

## PRICING SUGERIDO (Colombia)

| Plan | Precio/mes COP | Incluye |
|------|:--------------:|---------|
| **Básico** | $89.000 | Hasta 200 clientes, 500 WhatsApp/mes, soporte email |
| **Pro** | $149.000 | Clientes ilimitados, campañas manuales segmentadas, soporte prioritario |
| **Enterprise** | $249.000 | Multi-sede, analytics avanzados, soporte 24/7, onboarding presencial |

**Costo operativo real del sistema por restaurante (~USD/mes):**
- Vercel Hobby: $0
- Supabase Free: $0
- Twilio WhatsApp: ~$5-15 USD (pay-as-you-go, depende de mensajes enviados)
- VPS n8n (compartido entre clientes): ~$3-5 USD

Margen alto especialmente en planes Pro y Enterprise.

---

## PROPUESTA DE VALOR — FRASES CLAVE PARA LA PÁGINA

- **"Convierte cada visita en una relación"** — el restaurante deja de perder clientes anónimos
- **"Sin app. Solo un QR y el celular del cliente"** — fricción cero para el usuario final
- **"WhatsApp automático en el momento exacto"** — el mensaje correcto en el momento correcto
- **"Del domicilio al CRM sin que el cliente haga nada"** — captura pasiva de domicilios
- **"Tus clientes siempre saben cuánto les falta para su próximo premio"** — gamificación visible
- **"El restaurante con memoria"** — nunca más pierde un cliente por no saber quién es
- **"Dashboard en tiempo real desde el celular"** — el admin ve todo desde donde esté
- **"Desde $89.000/mes — menos que un día de ventas"** — precio accesible

---

## LO QUE EL SISTEMA NO ES (para no sobre-prometer)

- No es una app que el cliente descarga (es web)
- No reemplaza el sistema de POS/caja del restaurante
- No procesa pagos
- No gestiona el menú del restaurante
- No es un chatbot de pedidos completo (solo captura datos de domicilios reenviados)

---

## INTEGRACIONES ACTIVAS

| Integración | Qué hace |
|-------------|----------|
| **WhatsApp Business API** (Twilio) | Envío de todos los mensajes automáticos y campañas |
| **Google Contacts** | Backup automático de clientes del restaurante en su cuenta Google |
| **Google Maps** | Pop-up de solicitud de reseña Google después del check-in |
| **OpenAI GPT-4o-mini** | Extracción automática de datos de pedidos de domicilio en lenguaje natural |
| **n8n** | Orquestador de automatizaciones, crons, workflows |

---

## SEGURIDAD Y PRIVACIDAD

- Los datos de cada restaurante están **completamente aislados** (un proyecto Supabase por cliente)
- **Row Level Security (RLS)** en PostgreSQL: ningún usuario puede ver datos de otro restaurante
- Los clientes pueden **rechazar marketing** en el momento del registro (campo `accepts_marketing`)
- Las contraseñas y claves API **nunca están en el código fuente** (variables de entorno)
- Comunicaciones protegidas con HMAC (verificación de firma Twilio)
- Rate limiting para prevenir abuso del endpoint público de check-in

---

## ONBOARDING — ¿QUÉ SE NECESITA PARA EMPEZAR?

**Por parte del proveedor (nosotros):**
1. Clonar el repo y crear proyecto Vercel para el cliente
2. Crear proyecto Supabase y ejecutar migraciones
3. Configurar Twilio (número WhatsApp aprobado)
4. Crear y enviar a aprobación las plantillas WhatsApp (tarda 24-48h en Meta)
5. Generar el QR para las mesas

**Por parte del restaurante (cliente):**
1. Imprimir el QR y ponerlo en las mesas
2. Acceder al dashboard con email y contraseña
3. Configurar sus recompensas (qué premio en qué visita)
4. Asignar las plantillas aprobadas en Ajustes

**Tiempo estimado de setup:** 2-4 horas (sin contar aprobación de Meta, que toma 24-48h)

---

## DIFERENCIADORES VS COMPETENCIA

| Característica | Este sistema | Apps de sellos típicas | CRMs genéricos |
|----------------|:------------:|:---------------------:|:--------------:|
| Sin app para el cliente | ✅ | ❌ (requieren descarga) | ❌ |
| WhatsApp automatizado | ✅ | ❌ | Costoso |
| Captura de domicilios automática | ✅ | ❌ | ❌ |
| Dashboard con analytics reales | ✅ | Básico | ✅ pero complejo |
| Personalizado por restaurante | ✅ | ❌ genérico | ❌ genérico |
| Precio accesible Colombia | ✅ desde $89K | Variable | $300K+ |
| Implementación en horas | ✅ | Días/semanas | Semanas/meses |

---

## DATOS CURIOSOS / STORYTELLING

- En Colombia, WhatsApp tiene ~95% de penetración entre usuarios de celular — es el canal de comunicación preferido, no el email
- El costo promedio de adquirir un cliente nuevo es 5x mayor que retener uno existente
- Un restaurante con 300 clientes activos puede generar ~$2.5M COP adicionales al mes solo con reactivación (300 clientes × $35.000 ticket promedio × 25% tasa reactivación)
- El QR elimina el factor humano: no depende de que el mesero le pregunte al cliente
- El sistema recuerda el cumpleaños de cada cliente — el restaurante nunca olvida una fecha especial

---

## STACK VISIBLE PARA CREDIBILIDAD TÉCNICA

Next.js · React · TypeScript · Supabase · PostgreSQL · Twilio · WhatsApp Business API · OpenAI · Vercel · n8n · TailwindCSS · shadcn/ui

---

*Este archivo contiene toda la información necesaria para construir la página web de ventas del producto. No incluye instrucciones de diseño ni implementación técnica de la landing — eso es decisión del diseñador.*
