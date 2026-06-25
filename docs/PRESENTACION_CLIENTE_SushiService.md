# Sushi Service — RestaurantQR: Plataforma de Fidelización y CRM Automatizado

> **Documento recopilatorio para presentación al cliente**
> **Proyecto:** RestaurantQR (implementado para Sushi Service)
> **Stack:** Next.js 16 + Supabase + Twilio WhatsApp + Vercel
> **Clientes activos en sistema:** 193 registrados (datos en producción)
> **Estado:** Sistema en producción, operando en vivo

---

## 1. LO QUE SE LOGRÓ EN 2 SEMANAS (Prueba de Éxito)

En un sprint de desarrollo intensivo (equivalente a ~2 semanas de trabajo productivo), se construyó y desplegó un **sistema de fidelización completo de clase enterprise** que ya está operando en producción con clientes reales.

### Métricas Reales del Sistema (capturadas en vivo)

| Indicador | Valor |
|-----------|-------|
| **Clientes registrados** | 193 |
| **Visitas hoy** | 7 |
| **Check-ins por QR hoy** | 4 |
| **Domicilios procesados hoy** | 3 |
| **Nuevos clientes hoy** | 5 |
| **Clientes frecuentes (3+ visitas)** | 4 |
| **Cumpleaños hoy** | 0 |
| **Clientes reactivados (mes)** | 4 |
| **ROI estimado mensual** | **$272.000 COP** |
| **Ticket promedio estimado** | $68.000 COP |

### Timeline de Construcción (Versiones clave desplegadas)

| Versión | Fecha | Hitos Clave |
|---------|-------|-------------|
| v0.24–0.29 | Abril 2026 | Deploy base, control de tráfico, frequency cap, UX check-in |
| v0.30–0.35 | Mayo 2026 | Calendario operativo, heatmap Colombia, auto-refresh dashboard |
| v1.0.0–1.0.3 | Mayo 2026 | **Sistema de Puntos + Mystery Box + Tiers** (reestructuración mayor) |
| v1.1.0–1.1.7 | Mayo 2026 | **Verificación QR por Mesero** (anti-fraude, login PIN, dispositivos de confianza) |
| v1.2.0–1.3.0 | Junio 2026 | Fidelización visual "a prueba de imbéciles", CustomerCard tipo wallet, preview dinámica de premios |
| v1.4.0–1.5.2 | Junio 2026 | Dashboard Twilio métricas en tiempo real, reactivación configurable, rediseño campañas |
| v1.7.0–1.8.0 | Junio 2026 | Tracking completo de mensajes WhatsApp, fallback visual, opt-out persistente (auditoría aprobada) |
| v2.0.0 | Junio 2026 | **Redención física de premios + Golden Bullet** (importación masiva de contactos con ROI automático) |

---

## 2. CÓMO FUNCIONA EL ECOSISTEMA

El sistema funciona como un **CRM automatizado con gamificación** que conecta tres actores: **el cliente**, **el mesero** y **el administrador del restaurante**.

### Flujo del Cliente (Presencial — QR)

1. El cliente escanea un QR en la mesa → abre `/check-in` en su celular.
2. Ingresa solo su número de celular (10 dígitos).
3. Si es nuevo: registra nombre y cumpleaños → recibe **bonus de bienvenida aleatorio (75–90 pts)**.
4. Si ya existe: el sistema muestra su **tarjeta digital tipo wallet** con QR dinámico personal.
5. El cliente le muestra el QR al mesero.
6. El mesero escanea con su celular/tablet autenticada → registra la visita.
7. El cliente ve en su pantalla: **ruleta de puntos**, saldo total, y progreso hacia el próximo premio.
8. Si cruza un umbral → elige entre **premio seguro** o **Mystery Box**.
9. Recibe confirmación por **WhatsApp** con su premio y puntos.

### Flujo del Cliente (Domicilio — WhatsApp)

1. El cliente pide domicilio por WhatsApp al restaurante.
2. El mesero **reenvía** el mensaje al número del sistema.
3. La IA (GPT-4o-mini) extrae automáticamente: nombre, celular, dirección, monto.
4. El sistema registra al cliente, suma visita, otorga puntos, evalúa tiers.
5. El cliente recibe mensaje de bienvenida o puntos por WhatsApp.
6. Se sincroniza automáticamente con **Google Contacts**.

### Flujo del Administrador (Dashboard)

1. Ingresa al panel en `/dashboard` con su usuario.
2. Ve **métricas en tiempo real**: visitas, QR, domicilios, nuevos, frecuentes, cumpleaños.
3. Monitorea **niveles de clientes**: Plata → Oro → Platino → Black (con porcentajes).
4. Ejecuta **campañas automáticas** (cumpleaños, reactivación) o **campañas masivas manuales** segmentadas.
5. Gestiona **recompensas por tiers**, configura **Mystery Box**, controla **puntos por visita**.
6. Ve **ROI estimado** basado en clientes reactivados × ticket promedio.
7. Supervisa **mensajería WhatsApp**: enviados, entregados, leídos, fallidos, opt-outs.

---

## 3. CARACTERÍSTICAS PRINCIPALES Y MEJORES FUNCIONES

### 3.1 Campañas Automáticas + Ecosistema Personalizado

> *"Un ecosistema personalizado para cada cliente que sabe perfectamente en qué momento debe volver y lo invita por WhatsApp"*

| Función | Descripción |
|---------|-------------|
| **Cumpleaños automático** | Cron diario a las 8am. Detecta cumpleañeros, envía mensaje personalizado con puntos actuales. Sin duplicados (1 año de dedup). |
| **Reactivación suave (21 días)** | "Tus puntos te esperan, estás cerca de [próximo premio]". |
| **Reactivación agresiva (25+ días)** | "Tus puntos llevan tiempo sin moverse — no dejes enfriar tu progreso". |
| **Frequency Cap inteligente** | Ningún cliente recibe más de 1 mensaje cada 7 días. Protege la relación. |
| **Recovery Zone** | Clientes entre 18–25 días sin visitar están reservados exclusivamente para reactivación automática; las campañas manuales los saltan. |
| **Días configurables** | El dueño puede cambiar cuándo dispara la reactivación desde el dashboard. |
| **Cap mensual de marketing** | Máximo 3 mensajes de marketing por cliente al mes. Protege la cuenta de WhatsApp de bloqueos. |
| **Pre-event blackout** | Antes de eventos programados, las campañas manuales se pausan automáticamente para no saturar. |
| **Mensajes dopamínicos** | Tono cálido, cercano, enérgico. Con emojis moderados, números visibles, progreso claro. Aprobado por Meta (compliant). |
| **Segmentación inteligente** | SegmentRadar en dashboard: Activos, Recuperación, Perdidos, Cumpleaños. Filtros por ciudad, visitas, tier. |

### 3.2 Sistema de Puntos que Hace que los Clientes Quieran Volver

> *"Puntos que hacen que los clientes quieran volver"*

#### Algoritmo Inteligente de 3 Visitas (Garantizado)

- **Visita 1:** Puntos altos aleatorios (60–90 pts) → el cliente piensa "con 2 visitas llego".
- **Visita 2:** El sistema **limita** para dejarlo 5–30 pts corto del umbral → "¡Casi lo logro!" (efecto casi-acierto psicológico).
- **Visita 3:** Garantiza cruzar el umbral → **PREMIO SEGURO**.

**Resultado:** El cliente siempre necesita mínimo 3 visitas para su primera recompensa, pero siente que está "a nada".

#### Tiers Acumulativos (Progresión sin Reset)

| Tier | Puntos | Premio Seguro | Mystery Box |
|------|--------|---------------|-------------|
| 🥉 Bronce | 150 | Bebida gratis | ✅ ON |
| 🥈 Plata | 350 | Postre gratis | ✅ ON |
| 🥇 Oro | 600 | Plato fuerte gratis | ✅ ON |
| 🖤 BLACK | 1000 | Experiencia Chef | ❌ OFF (premio exclusivo) |

- Los puntos **NUNCA se resetean**.
- El cliente sube de nivel acumulando, no perdiendo progreso.

#### Mystery Box con Gamificación Psicológica

- **Elección en la web:** Cuando cruza un tier, el cliente elige en su celular: "Ir a la segura" o "Mystery Box".
- **Probabilidades configurables** por tier desde el dashboard (ej: Bebida 70%, Postre 25%, Plato 5%).
- **Near-Miss Effect:** Si no gana el premio top, la UI muestra "¡Ufff! La ruleta paró a un pelo del Plato Fuerte 🤯".
- **Pity Timer (Golden Box):** Si gana 2 premios del tier más bajo seguidos, la siguiente Mystery Box se convierte en **Golden Box** (elimina el premio más bajo, redistribuye probabilidades).
- **Cap Global de Premios Altos:** El dueño limita cuántos "platos fuertes gratis" se entregan por mes. Si se alcanza el límite, la probabilidad se redistribuye automáticamente al tier inferior.

#### Tarjeta Digital Tipo Wallet ("A prueba de imbéciles")

- Banner rojo imperativo: **"DILE AL MESERO QUE TE ESCANEE — Si no, NO sumás puntos"**.
- QR dinámico personal con borde pulsante.
- Termómetro gigante de puntos con animación de llenado.
- Camino completo de tiers (Bronce → Plata → Oro → BLACK).
- Overlay de dopamina: cuando el mesero escanea, flash verde "+X pts" antes de pasar a éxito.

### 3.3 Campañas Masivas para Todos los Clientes

| Función | Descripción |
|---------|-------------|
| **Campañas manuales segmentadas** | Filtra por ciudad, número de visitas, edad, tier de fidelización. |
| **Estimador de audiencia** | Antes de enviar, el sistema calcula exactamente cuántos clientes recibirán el mensaje (aplicando frequency cap y recovery zone). |
| **Envío en batches de 10** | Protege la cuenta de WhatsApp de límites de rate. |
| **Plantillas aprobadas por Meta** | El sistema usa Twilio Content API con plantillas pre-aprobadas por Meta. Sin riesgo de ban. |
| **Calendario operativo de eventos** | Programa eventos/promos con fecha, imagen/video, audiencia y modo de envío (recordatorio manual o auto-dispatch cada 15 min). |
| **Golden Bullet — Importación masiva** | Sube un CSV con 2.500–9.500 contactos. El sistema valida, calcula costo, envía **un solo mensaje** con promo directa. Los que responden se convierten automáticamente en clientes. Bloqueo anti-reenvío permanente. ROI automático por lote. |

### 3.4 Control Total de tus Clientes

| Función | Descripción |
|---------|-------------|
| **Base de datos completa** | 193 clientes con: nombre, celular, cumpleaños, ciudad, visitas, puntos, tier actual, última visita, consentimiento de marketing. |
| **Historial de visitas** | Cada visita registrada con fuente (QR, domicilio, staff scan), mesa, mesero que escaneó, timestamp. |
| **Historial de puntos** | Tabla `point_transactions`: cuántos puntos, de qué fuente (visita, bienvenida, evento, campaña), balance después de la transacción. |
| **Historial de Mystery Box** | `mystery_box_results`: qué eligió (safe/mystery), qué premio ganó, si fue Golden Box, cuándo. |
| **Edición de clientes** | Desde el dashboard el admin puede editar nombre, cumpleaños, ciudad y consentimiento de marketing. |
| **Filtros avanzados** | Canal (QR / Domicilio / Ambos), Nivel (Plata/Oro/Platino/Black), Estado (Activos / Recuperación / Perdidos). |
| **Verificación anti-fraude** | El sistema de meseros con QR dinámico garantiza que nadie puede auto-asignarse puntos desde su casa. |
| **Trazabilidad de entregas** | Tabla `reward_redemptions`: qué cliente, qué premio, qué mesero, qué mesa, referencia POS. Cuadra con el punto de venta. |

### 3.5 Datos Muy Claros de qué Sucede en el Restaurante

#### Dashboard de Métricas (Actualización automática cada 60 segundos)

| KPI | Valor actual (producción) |
|-----|---------------------------|
| Visitas hoy | 7 |
| QR hoy | 4 |
| Domicilios hoy | 3 |
| Nuevos clientes hoy | 5 |
| Total clientes | 193 |
| Frecuentes (3+ visitas) | 4 |
| Cumpleaños hoy | 0 |

#### Niveles de Clientes (Visualización en tiempo real)

- Plata: 193 clientes (100% del total — el restaurante está en etapa inicial de crecimiento)
- Oro: 0 (0%)
- Platino: 0 (0%)
- Black: 0 (0%)

> Nota: Los tiers recién se activaron con el sistema de puntos. Se espera migración de clientes existentes a tiers superiores en las próximas semanas.

#### ROI Estimado (Automático)

- **$272.000 COP** este mes (basado en 4 clientes reactivados × ticket promedio $68.000).
- Fórmula transparente: `clientes reactivados × ticket promedio`.
- En modo demo: desglose adicional con tasa de atracción de campañas (23%) y ROI de retención.

#### Panel de Mensajería WhatsApp (En tiempo real desde Twilio API)

- Mensajes enviados / entregados / leídos / fallidos / no entregados.
- Gráfico de área con evolución diaria (7/30/90 días).
- Tabla de opt-outs con motivo y código de error.
- Desglose de fallos: número inválido, sin WhatsApp, opt-out, plantilla rechazada.
- Saldo Twilio visible.

#### Heatmap de Visitas (Zona horaria Colombia)

- Convierte UTC a hora Colombia (UTC-5) automáticamente.
- Muestra qué días y horas hay más tráfico para tomar decisiones operativas.

#### Power Ranking

- Top 20 clientes con ranking estilo "anime" (los más fieles).

### 3.6 Verificación Presencial con Mesero (Anti-fraude)

> *"Nadie puede sumar puntos desde su casa"*

- **QR dinámico personal:** El cliente genera un token JWT efímero (5 minutos de validez) con su nombre, teléfono y customer_id.
- **Dos modos de mesero:**
  - **Dispositivo de confianza:** Celular/tablet del restaurante configurado una vez por el supervisor. No requiere PIN.
  - **Login con PIN:** Mesero usa su celular con número + PIN de 4-6 dígitos.
- **Escaneo con cámara:** `html5-qrcode` lee el QR del cliente.
- **Confirmación:** El mesero ve nombre del cliente, número enmascarado, y selecciona mesa antes de registrar.
- **Trazabilidad:** Cada visita guarda `registered_by_staff_id` y `table_number`.
- **Fallback manual:** Si la cámara falla, el mesero puede ingresar el número manualmente.

### 3.7 Tracking y Trazabilidad Completa de WhatsApp

| Función | Descripción |
|---------|-------------|
| **message_logs** | Persiste TODOS los mensajes WhatsApp (transaccionales + campañas): estado, código de error Twilio, timestamp. |
| **Fallback visual** | Si el WhatsApp de premio falla, la pantalla del cliente muestra: "No pudimos enviarte el WhatsApp. Muestra esta pantalla al mesero para reclamar tu premio". |
| **Opt-out persistente** | Si un cliente responde SALIR/STOP/BAJA/CANCELAR, el sistema lo marca permanentemente y deja de enviarle mensajes (evita errores 21610 de Twilio y bloqueos de Meta). |
| **Prechequeo de opt-out** | Antes de enviar cualquier mensaje, verifica si el cliente está en opt-out. Si sí, omite el envío y lo registra como `opted_out_local`. |

### 3.8 Redención Física de Premios + Cuadre con POS

| Función | Descripción |
|---------|-------------|
| **reward_redemptions** | Tabla que registra la entrega física de cada premio: cliente, premio, mesero, mesa, referencia POS. |
| **Alerta al mesero** | Cuando escanea un cliente que tiene premio pendiente, el sistema muestra: "¡Este cliente tiene un premio pendiente!" con botón "Registrar Entrega". |
| **Dashboard de redenciones** | Filtros por fecha, heatmap de turnos (hora del día), resumen por premio/mesero. Exportable a CSV. |
| **Anti-duplicado** | Índice único por `mystery_box_result_id` evita que un premio se redima dos veces. |

---

## 4. TRANSFORMACIÓN DEL NEGOCIO

### Antes del sistema

- No se conocía a los clientes que visitaban el restaurante.
- El domicilio era "cliente anónimo" — solo un número en una app de delivery.
- Las promociones se hacían a ciegas (panfletos, redes sociales sin segmentación).
- No había forma de saber quién volvía y quién se perdía.
- Las recompensas eran manuales y difíciles de controlar.

### Con RestaurantQR

| Área | Transformación |
|------|---------------|
| **Captación** | Cada cliente que escanea QR o pide domicilio queda registrado con nombre, celular, cumpleaños y ciudad. Base de datos creciente automáticamente. |
| **Fidelización** | Sistema de puntos con gamificación psicológica que garantiza 3 visitas para el primer premio, pero hace que el cliente sienta que está "a nada" desde la visita 2. |
| **Retención** | Campañas automáticas que detectan cuándo un cliente deja de venir y lo invitan de vuelta con sus puntos actuales como gancho. |
| **Ingresos** | Reactivación de clientes inactivos = ingresos directos. ROI estimado de $272.000/mes solo por reactivación. |
| **Control** | El dueño ve en tiempo real: cuántos clientes, cuántas visitas, qué premios se entregan, qué campañas funcionan, cuánto cuesta la mensajería. |
| **Anti-fraude** | Nadie puede auto-asignarse puntos. Solo un mesero autenticado puede registrar visitas escaneando el QR del cliente en persona. |
| **Operación** | El mesero solo reenvía un mensaje de WhatsApp para domicilios. La IA extrae datos automáticamente. Sin trabajo manual de registro. |
| **Escalabilidad** | El sistema es **clone-por-cliente**: cada restaurante tiene su propio deploy aislado pero el código se replica fácilmente. |

---

## 5. STACK TÉCNICO Y ARQUITECTURA

| Capa | Tecnología |
|------|-----------|
| **Frontend** | React 19 + Next.js 16 (App Router) |
| **Estilos** | TailwindCSS 4 + shadcn/ui + Lucide React |
| **Backend** | API Routes de Next.js (serverless en Vercel) |
| **Base de Datos** | Supabase (PostgreSQL) con RLS |
| **Auth** | Supabase Auth (cookies HttpOnly) |
| **Mensajería** | Twilio SDK (WhatsApp Business API) |
| **Automatizaciones** | Vercel Cron Jobs + n8n (workflows de IA y Google Contacts) |
| **Deploy** | Vercel (producción) |
| **Tipo de negocio** | Compatible con cualquier tipo: restaurantes, barberías, cafeterías, etc. |

---

## 6. DATOS CLAVE PARA LA PRESENTACIÓN

- **193 clientes** ya registrados en producción.
- **Sistema operando en vivo** — no es un prototipo.
- **ROI cuantificable**: $272.000 COP mensuales solo de reactivación (con ticket promedio $68.000).
- **Algoritmo propietario** de gamificación con psicología del "casi-acierto".
- **Anti-fraude** con verificación presencial por mesero.
- **Compliance con Meta**: opt-out persistente, plantillas aprobadas, frequency cap, tone compliant.
- **Multi-tenant**: replicable para cualquier otro restaurante sin cambiar código.
- **Costo de mensaje**: ~$0.0175 USD por mensaje WhatsApp (Meta + Twilio).

---

*Documento generado el 15 de junio de 2026 a partir del repo de RestaurantQR / Sushi Service.*
