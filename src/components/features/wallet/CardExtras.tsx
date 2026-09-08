'use client'

/**
 * Lo que la tarjeta muestra ADEMÁS de puntos y sellos (Tarjeta principal,
 * dueño 2026-09-08): redes, perfil de Google, descripción breve, contacto y
 * políticas — *"todo esto desplegable y bien elegante dentro de la tarjeta"*.
 *
 * Dos decisiones de diseño:
 *   · Las redes van como una fila de círculos con ícono, sin texto: es lo que
 *     cabe en una tarjeta de 360 px y es lo que el cliente reconoce.
 *   · El resto se pliega. Una sección a la vez, cerrada por defecto: la
 *     tarjeta sigue siendo puntos y sellos, y lo demás está a un toque.
 *
 * SIN CONFIG NO DIBUJA NADA. Un tenant que no cargó redes ni textos ve la
 * tarjeta de siempre, sin una línea de más. Los colores salen del tema de la
 * tarjeta (`WalletCardTheme`): blancos y transparencias sobre el gradiente de
 * marca, dorados sobre el Black. Ni un hex acá.
 */

import { useState, type ReactNode } from 'react'
import { ChevronDown, Clock, Globe, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import type { CardExtras as CardExtrasData } from '@/lib/branding'
import { NO_GOOGLE_REVIEW_URL } from '@/lib/branding'
import type { WalletCardTheme } from '@/constants/wallet-card-theme'

interface CardExtrasProps {
  extras: CardExtrasData
  instagramUrl: string | null
  whatsappLink: string | null
  /** Link de reseñas. Se usa como perfil de Google si no hay uno propio. */
  googleReviewUrl: string
  theme: WalletCardTheme
  /** Vista previa del panel: solo la fila de redes y los títulos, sin abrir nada. */
  compact?: boolean
}

type SectionId = 'about' | 'contact' | 'policies'

export function CardExtras({ extras, instagramUrl, whatsappLink, googleReviewUrl, theme, compact = false }: CardExtrasProps) {
  const [open, setOpen] = useState<SectionId | null>(null)

  const googleUrl = extras.googleProfileUrl ?? (googleReviewUrl !== NO_GOOGLE_REVIEW_URL ? googleReviewUrl : null)
  const socials: { key: string; href: string; label: string; icon: ReactNode }[] = []
  if (instagramUrl) socials.push({ key: 'ig', href: instagramUrl, label: 'Instagram', icon: <InstagramGlyph /> })
  if (extras.facebookUrl) socials.push({ key: 'fb', href: extras.facebookUrl, label: 'Facebook', icon: <FacebookGlyph /> })
  if (extras.tiktokUrl) socials.push({ key: 'tt', href: extras.tiktokUrl, label: 'TikTok', icon: <TikTokGlyph /> })
  if (whatsappLink) socials.push({ key: 'wa', href: whatsappLink, label: 'WhatsApp', icon: <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.8} /> })
  if (googleUrl) socials.push({ key: 'g', href: googleUrl, label: 'Google', icon: <GoogleGlyph /> })
  if (extras.websiteUrl) socials.push({ key: 'web', href: extras.websiteUrl, label: 'Sitio web', icon: <Globe className="h-[18px] w-[18px]" strokeWidth={1.8} /> })

  const hasContact = Boolean(extras.contactPhone || extras.contactEmail || extras.address || extras.hours)
  const sections: { id: SectionId; title: string; body: ReactNode }[] = []
  if (extras.description) {
    sections.push({
      id: 'about',
      title: 'Quiénes somos',
      body: <p className="whitespace-pre-line text-[13px] leading-relaxed" style={{ color: theme.hintStrong }}>{extras.description}</p>,
    })
  }
  if (hasContact) {
    sections.push({
      id: 'contact',
      title: 'Contacto y horario',
      body: (
        <ul className="space-y-2 text-[13px]" style={{ color: theme.hintStrong }}>
          {extras.contactPhone ? (
            <ContactRow icon={<Phone className="h-3.5 w-3.5" strokeWidth={1.8} />} color={theme.tierReward}>
              <a href={`tel:${extras.contactPhone.replace(/[^0-9+]/g, '')}`} className="underline-offset-2 hover:underline">{extras.contactPhone}</a>
            </ContactRow>
          ) : null}
          {extras.contactEmail ? (
            <ContactRow icon={<Mail className="h-3.5 w-3.5" strokeWidth={1.8} />} color={theme.tierReward}>
              <a href={`mailto:${extras.contactEmail}`} className="break-all underline-offset-2 hover:underline">{extras.contactEmail}</a>
            </ContactRow>
          ) : null}
          {extras.address ? (
            <ContactRow icon={<MapPin className="h-3.5 w-3.5" strokeWidth={1.8} />} color={theme.tierReward}>
              <span>{extras.address}</span>
            </ContactRow>
          ) : null}
          {extras.hours ? (
            <ContactRow icon={<Clock className="h-3.5 w-3.5" strokeWidth={1.8} />} color={theme.tierReward}>
              <span className="whitespace-pre-line">{extras.hours}</span>
            </ContactRow>
          ) : null}
        </ul>
      ),
    })
  }
  if (extras.policies) {
    sections.push({
      id: 'policies',
      title: 'Políticas',
      body: <p className="whitespace-pre-line text-[12.5px] leading-relaxed" style={{ color: theme.hintStrong }}>{extras.policies}</p>,
    })
  }

  if (socials.length === 0 && sections.length === 0) return null

  return (
    <div className="w-full">
      {socials.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {socials.map((s) => (
            <a
              key={s.key}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.label}
              title={s.label}
              className="flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
              style={{ background: theme.tierReachedBg, border: theme.tierReachedBorder, color: theme.tierName }}
            >
              {s.icon}
            </a>
          ))}
        </div>
      ) : null}

      {sections.length > 0 ? (
        <div className={`space-y-2 ${socials.length > 0 ? 'mt-4' : ''}`}>
          {sections.map((section) => {
            const isOpen = !compact && open === section.id
            return (
              <div
                key={section.id}
                className="overflow-hidden rounded-xl"
                style={{ background: theme.tierLockedBg, border: theme.tierLockedBorder }}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((prev) => (prev === section.id ? null : section.id))}
                  className="flex min-h-11 w-full items-center justify-between px-3.5 py-2.5 text-left"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: theme.sectionLabel }}>
                    {section.title}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                    strokeWidth={1.8}
                    style={{ color: theme.tierPts }}
                  />
                </button>
                {isOpen ? <div className="px-3.5 pb-3.5">{section.body}</div> : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function ContactRow({ icon, color, children }: { icon: ReactNode; color: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0" style={{ color }}>{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  )
}

// ─── Glifos de redes. lucide ya no trae marcas; son trazos mínimos en currentColor. ───

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

function FacebookGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
      <path d="M13.5 21v-7.2h2.5l.4-3h-2.9V8.9c0-.9.3-1.5 1.5-1.5h1.5V4.7c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21h2.9z" />
    </svg>
  )
}

function TikTokGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
      <path d="M16.6 3c.3 2.3 1.6 3.7 3.9 3.9v3c-1.5 0-2.8-.4-3.9-1.2v6.2c0 3.2-2.6 5.6-5.7 5.6-3 0-5.5-2.5-5.5-5.6 0-3.4 3.1-6 6.6-5.4v3.1c-1.7-.5-3.4.7-3.4 2.4 0 1.3 1 2.4 2.3 2.4 1.4 0 2.4-1 2.4-2.6V3h3.3z" />
    </svg>
  )
}

function GoogleGlyph() {
  return (
    <span className="font-playfair text-[17px] font-bold leading-none" aria-hidden>
      G
    </span>
  )
}
