# Feature: Programa de Referidos + QR Dinámicos (Influencers / Promos)

> **Estado:** 📋 PLAN — NO IMPLEMENTADO (aprobado para diseño, pendiente de desarrollo)
> **Prerequisito ya implementado (v1.6.0):** `checkin_first_visit_free = 'false'` — todo cliente nuevo debe ser validado por el mesero escaneando su QR. Esto es la base anti-fraude de los referidos y promos.
> **Dependencias previstas:** infraestructura existente (staff scan, points, Twilio, dashboard). Sin librerías nuevas.

---

## 1. Visión

Dos features que comparten la misma infraestructura:

1. **Programa de Referidos** — Ultra visual y dopaminico. El cliente, después de su visita (o desde su tarjeta QR), ve un botón potente: **"🎁 Gánate {recompensa} por traer a un amigo"**. Comparte un link/QR personal por WhatsApp. Cuando el amigo se registra Y el mesero valida su primera visita en el local, ambos ganan.
2. **QR Dinámicos de Campaña** — El restaurante crea desde el dashboard QRs especiales (para influencers, promos, eventos) con una recompensa configurable. La gente escanea, se registra, recibe su QR especial con premio y el mesero lo escanea para redimirlo en el local.

**Principio anti-fraude:** ninguna recompensa se acredita sin escaneo del mesero (presencia física verificada).

---

## 2. Programa de Referidos

### 2.1 Flujo del referidor (cliente existente)
1. En `CheckInSuccess` (tras sumar visita) y en `CustomerCard` aparece el CTA dopaminico:
   - Botón grande animado (pulso/gradiente): **"🎁 Gánate {X} por traer a un amigo"**
   - `{X}` = recompensa configurada por el restaurante en el dashboard (puntos, producto o ambas).
2. Al tocar: pantalla/modal "Tu link mágico" con:
   - Link único `https://{dominio}/r/{codigo}` (código corto de 6-8 chars ligado al customer)
   - Botón "Compartir por WhatsApp" (`wa.me/?text=...` con mensaje pre-armado: "Te regalo {beneficio del amigo} en {BRAND_NAME} 🎁 Regístrate aquí: {link}")
   - QR del link (para mostrar en persona)
   - Contador social: "Ya invitaste a N amigos · Ganaste {Y} pts"
3. Estado de referidos visible: lista "Tus invitados" con estados `pendiente` (registrado, sin visita validada) / `completado` (mesero escaneó → recompensa acreditada).

### 2.2 Flujo del referido (cliente nuevo)
1. Abre `/r/{codigo}` → landing visual: "{Nombre} te regaló {beneficio} 🎁" + formulario de registro normal (mismo `CheckInForm`, con `referral_code` en contexto).
2. Se registra → **siempre** entra al flujo `registered_pending_scan` (aunque `checkin_first_visit_free` global sea `true`, los referidos SIEMPRE requieren validación del mesero).
3. Muestra su QR personal con badge "🎁 Premio de bienvenida: {beneficio}".
4. Mesero escanea → se registra la visita + se acredita:
   - Al **referido**: welcome bonus + beneficio configurado (puntos extra o producto).
   - Al **referidor**: recompensa configurada + WhatsApp de notificación ("¡{Amigo} ya vino! Ganaste {X} 🎉").

### 2.3 Reglas de negocio
- Un teléfono solo puede ser referido una vez (validación en registro).
- Auto-referencia bloqueada (mismo teléfono / mismo customer).
- Cap configurable: máx. N referidos recompensados por cliente al mes (default 10).
- Expiración configurable del estado `pendiente` (default 30 días).
- La recompensa del referidor se acredita SOLO cuando el mesero valida la visita del referido (`source='staff_scan'`).
- Si la recompensa es producto, se entrega como cupón canjeable visible en `CustomerCard` (mesero lo redime con escaneo, igual que Mystery Box).

### 2.4 Configuración en Dashboard (nueva página `/dashboard/referidos`)
| Setting | Tipo | Default |
|---------|------|---------|
| `referral_enabled` | toggle | `false` |
| `referral_referrer_reward_type` | `points` \| `product` | `points` |
| `referral_referrer_reward_points` | número | 100 |
| `referral_referrer_reward_title` | texto (si producto) | — |
| `referral_referred_reward_type` / `points` / `title` | ídem para el amigo | 50 pts |
| `referral_monthly_cap` | número | 10 |
| `referral_pending_expiry_days` | número | 30 |
| `referral_share_message` | texto plantilla del WhatsApp | default con emojis |

Además: panel de métricas (referidos totales, conversión registro→visita, top referidores, ROI estimado con `avg_ticket`).

---

## 3. QR Dinámicos de Campaña (influencers / promos)

### 3.1 Flujo
1. Admin crea campaña en `/dashboard/qr-campaigns`: nombre ("Influencer @maria", "Promo Apertura"), recompensa (puntos/producto), fecha inicio/fin, cupo máximo de redenciones, slug del link.
2. El sistema genera link `https://{dominio}/c/{slug}` + QR descargable **desde el QR Studio** (tema + tamaño póster — reutiliza `qr-poster.ts` con headline de la promo).
3. Cliente escanea → landing de campaña (visual: premio grande, countdown si tiene fecha fin, cupos restantes para urgencia) → se registra (o hace lookup si ya existe).
4. Recibe su QR personal con badge del premio → mesero escanea en el local → visita + premio acreditados, redención contabilizada contra el cupo.

### 3.2 Reglas
- Un cliente solo redime cada campaña una vez.
- Campaña pausable/expirable; cupo global (`max_redemptions`).
- Tracking por campaña: registros, redenciones, visitas posteriores (retención del cohorte).

---

## 4. Modelo de Datos propuesto (migración futura `000XX_referrals.sql`)

```sql
-- Códigos de referido (1 por customer, lazy)
CREATE TABLE referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE UNIQUE,
  code text NOT NULL UNIQUE,            -- 6-8 chars, base32 sin ambiguos
  created_at timestamptz DEFAULT now()
);

-- Relación referidor → referido
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES customers(id),
  referred_id uuid NOT NULL REFERENCES customers(id) UNIQUE, -- un cliente solo es referido 1 vez
  status text NOT NULL DEFAULT 'pending',  -- pending | completed | expired
  completed_visit_id uuid REFERENCES visits(id),
  referrer_reward_points int,
  referred_reward_points int,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Campañas de QR dinámico
CREATE TABLE qr_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  reward_type text NOT NULL DEFAULT 'points',  -- points | product
  reward_points int,
  reward_title text,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions int,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Redenciones por campaña
CREATE TABLE qr_campaign_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES qr_campaigns(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  visit_id uuid REFERENCES visits(id),
  status text NOT NULL DEFAULT 'pending',  -- pending | redeemed | expired
  created_at timestamptz DEFAULT now(),
  redeemed_at timestamptz,
  UNIQUE (campaign_id, customer_id)
);
```

- `point_transactions.source` agrega valores: `'referral_reward'`, `'campaign_reward'`.
- RLS: solo service role escribe; lectura pública nula (todo vía API routes).

---

## 5. API Routes previstas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/referral/me?phone=` | Código + stats del referidor (genera código lazy) |
| GET | `/r/[code]` (page) | Landing de referido → check-in con contexto |
| POST | `/api/check-in` (extender) | `referral_code` / `campaign_slug` opcionales en `register` |
| POST | `/api/check-in` checkin (extender) | Al validar visita del mesero: completar referral / redención y acreditar recompensas |
| GET/POST/PATCH | `/api/dashboard/referral-config` | Configuración del programa |
| GET/POST/PATCH/DELETE | `/api/dashboard/qr-campaigns` | CRUD campañas + métricas |
| GET | `/c/[slug]` (page) | Landing de campaña |

---

## 6. UI/UX — lineamientos dopaminicos

- **CTA referidos:** botón con gradiente de marca + animación `pulse` sutil, emoji 🎁, copy imperativo. Aparece en: pantalla de éxito post-visita (momento de máxima dopamina) y en `CustomerCard`.
- **Landing referido/campaña:** premio como héroe (emoji gigante + título), nombre del referidor personalizado, barra de urgencia (cupos/countdown) y registro en 1 pantalla.
- **Celebración al completar:** confetti + "¡Ganaste {X}!" en el polling del referidor cuando su amigo es validado (igual que overlay de puntos actual).
- **WhatsApp:** plantillas Meta nuevas: `referral_completed` (al referidor) y `referral_welcome` (al referido). Requieren aprobación previa.

---

## 7. Fases de implementación sugeridas

| Fase | Alcance | Estimación |
|------|---------|-----------|
| 1 | Migración SQL + `referral.service.ts` + extender `/api/check-in` (register + checkin) | 1 sesión |
| 2 | Landing `/r/[code]` + CTA en CustomerCard/CheckInSuccess + compartir WhatsApp | 1 sesión |
| 3 | Dashboard `/dashboard/referidos` (config + métricas) | 1 sesión |
| 4 | QR dinámicos: tablas campañas + `/c/[slug]` + CRUD dashboard + integración QR Studio | 1-2 sesiones |
| 5 | Plantillas Twilio + notificaciones + pruebas E2E | 1 sesión |

## 8. Riesgos / decisiones abiertas
- [ ] ¿La recompensa del referidor por defecto en puntos o producto? (definir con cliente piloto)
- [ ] ¿Permitir referidos en modo `checkin_mode='auto'`? Propuesta: NO — referidos siempre `staff_verified`.
- [ ] Aprobación Meta de las plantillas nuevas puede tardar — iniciar trámite en Fase 1.
- [ ] Cupones de producto requieren UI de redención del mesero (extender `/mesero/confirm`).
