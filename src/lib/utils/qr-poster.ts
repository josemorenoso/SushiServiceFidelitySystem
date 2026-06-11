import QRCode from 'qrcode'

// ─── Temas visuales por tipo de negocio ───
export interface QrTheme {
  id: string
  label: string
  icon: string
  patternIcons: string[]
  patternOpacity: number
  bg: string
  bgGradient: [string, string] | null
  accent: string
  headerColor: string
  textColor: string
  subTextColor: string
  cardBg: string
  cardShadow: string
}

export const QR_THEMES: QrTheme[] = [
  {
    id: 'restaurante',
    label: 'Restaurante',
    icon: '🍽️',
    patternIcons: ['🍽️', '🍷', '🔥', '🥘'],
    patternOpacity: 0.09,
    bg: '#FFF8F0',
    bgGradient: null,
    accent: '#E63946',
    headerColor: '#1a1c1d',
    textColor: '#1a1c1d',
    subTextColor: '#6b7280',
    cardBg: '#FFFFFF',
    cardShadow: 'rgba(230, 57, 70, 0.22)',
  },
  {
    id: 'barberia',
    label: 'Barbería',
    icon: '💈',
    patternIcons: ['💈', '✂️', '🪒'],
    patternOpacity: 0.10,
    bg: '#0F1B2D',
    bgGradient: ['#0F1B2D', '#1B2A45'],
    accent: '#E63946',
    headerColor: '#FFFFFF',
    textColor: '#FFFFFF',
    subTextColor: '#9FB3CE',
    cardBg: '#FFFFFF',
    cardShadow: 'rgba(0, 0, 0, 0.45)',
  },
  {
    id: 'cafe',
    label: 'Café',
    icon: '☕',
    patternIcons: ['☕', '🥐', '🫘'],
    patternOpacity: 0.10,
    bg: '#F5EDE3',
    bgGradient: null,
    accent: '#6F4E37',
    headerColor: '#3A2A1D',
    textColor: '#3A2A1D',
    subTextColor: '#8A7563',
    cardBg: '#FFFFFF',
    cardShadow: 'rgba(111, 78, 55, 0.25)',
  },
  {
    id: 'bar',
    label: 'Bar / Cocteles',
    icon: '🍸',
    patternIcons: ['🍸', '🍹', '🍻'],
    patternOpacity: 0.11,
    bg: '#14091F',
    bgGradient: ['#14091F', '#2B1240'],
    accent: '#C084FC',
    headerColor: '#FFFFFF',
    textColor: '#FFFFFF',
    subTextColor: '#B79DD8',
    cardBg: '#FFFFFF',
    cardShadow: 'rgba(192, 132, 252, 0.35)',
  },
  {
    id: 'pizzeria',
    label: 'Pizzería',
    icon: '🍕',
    patternIcons: ['🍕', '🧀', '🍅'],
    patternOpacity: 0.10,
    bg: '#FFFBEF',
    bgGradient: null,
    accent: '#C8102E',
    headerColor: '#1F3D2B',
    textColor: '#1F3D2B',
    subTextColor: '#6b7280',
    cardBg: '#FFFFFF',
    cardShadow: 'rgba(200, 16, 46, 0.22)',
  },
  {
    id: 'sushi',
    label: 'Sushi',
    icon: '🍣',
    patternIcons: ['🍣', '🥢', '🍱'],
    patternOpacity: 0.10,
    bg: '#121212',
    bgGradient: ['#121212', '#241418'],
    accent: '#E63946',
    headerColor: '#FFFFFF',
    textColor: '#FFFFFF',
    subTextColor: '#A8A29E',
    cardBg: '#FFFFFF',
    cardShadow: 'rgba(230, 57, 70, 0.4)',
  },
  {
    id: 'postres',
    label: 'Postres / Heladería',
    icon: '🍰',
    patternIcons: ['🍰', '🍦', '🧁'],
    patternOpacity: 0.11,
    bg: '#FFF0F5',
    bgGradient: null,
    accent: '#EC4899',
    headerColor: '#831843',
    textColor: '#831843',
    subTextColor: '#BE6B96',
    cardBg: '#FFFFFF',
    cardShadow: 'rgba(236, 72, 153, 0.25)',
  },
  {
    id: 'elegante',
    label: 'Premium / Black',
    icon: '✦',
    patternIcons: ['✦', '✧', '★'],
    patternOpacity: 0.12,
    bg: '#0A0A0A',
    bgGradient: ['#0A0A0A', '#1C1505'],
    accent: '#D4AF37',
    headerColor: '#F5E6B8',
    textColor: '#FFFFFF',
    subTextColor: '#B5A268',
    cardBg: '#FFFFFF',
    cardShadow: 'rgba(212, 175, 55, 0.35)',
  },
]

// ─── Tamaños de impresión a 300 DPI ───
export interface QrSize {
  id: string
  label: string
  physical: string
  width: number
  height: number
}

export const QR_SIZES: QrSize[] = [
  { id: 'mesa', label: 'Mesa (tent card)', physical: '10×15 cm', width: 1181, height: 1772 },
  { id: 'cuadrado', label: 'Sticker / Pizarra', physical: '12×12 cm', width: 1417, height: 1417 },
  { id: 'a5', label: 'Media carta (A5)', physical: '14.8×21 cm', width: 1748, height: 2480 },
  { id: 'a4', label: 'Póster (A4)', physical: '21×29.7 cm', width: 2480, height: 3508 },
  { id: 'a3', label: 'Cartel grande (A3)', physical: '29.7×42 cm', width: 3508, height: 4961 },
]

export interface QrPosterOptions {
  url: string
  theme: QrTheme
  size: QrSize
  brandName: string
  headline: string
  subline: string
  label: string
  logoDataUrl: string | null
  accentOverride?: string | null
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawEmojiPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  icons: string[],
  opacity: number
): void {
  const cell = Math.round(width / 7)
  const fontSize = Math.round(cell * 0.52)
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.font = `${fontSize}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let iconIndex = 0
  let row = 0
  for (let y = cell / 2; y < height + cell; y += cell) {
    const offsetX = row % 2 === 0 ? 0 : cell / 2
    for (let x = cell / 2 + offsetX; x < width + cell; x += cell) {
      const icon = icons[iconIndex % icons.length]
      iconIndex++
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(((row % 2 === 0 ? -1 : 1) * 18 * Math.PI) / 180)
      ctx.fillText(icon, 0, 0)
      ctx.restore()
    }
    row++
  }
  ctx.restore()
}

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  baseSize: number,
  weight: string,
  family: string
): number {
  let size = baseSize
  ctx.font = `${weight} ${size}px ${family}`
  while (ctx.measureText(text).width > maxWidth && size > 12) {
    size -= 2
    ctx.font = `${weight} ${size}px ${family}`
  }
  return size
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = src
  })
  return img
}

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

/**
 * Renderiza el póster completo (fondo temático + textos + QR + logo + etiqueta)
 * en un canvas del tamaño físico elegido (300 DPI). Devuelve PNG data URL.
 */
export async function composeQrPoster(opts: QrPosterOptions): Promise<string> {
  const { theme, size, url } = opts
  const W = size.width
  const H = size.height
  const accent = opts.accentOverride || theme.accent

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')

  // ─── Fondo ───
  if (theme.bgGradient) {
    const grad = ctx.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, theme.bgGradient[0])
    grad.addColorStop(1, theme.bgGradient[1])
    ctx.fillStyle = grad
  } else {
    ctx.fillStyle = theme.bg
  }
  ctx.fillRect(0, 0, W, H)

  // ─── Patrón de iconos ───
  drawEmojiPattern(ctx, W, H, theme.patternIcons, theme.patternOpacity)

  // ─── Layout vertical proporcional ───
  const contentW = W * 0.84
  const leftX = W / 2
  let cursorY = H * 0.07

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Nombre del negocio
  const brandSize = fitFontSize(ctx, opts.brandName, contentW, Math.round(W * 0.075), 'bold', FONT)
  ctx.fillStyle = theme.headerColor
  ctx.font = `bold ${brandSize}px ${FONT}`
  ctx.fillText(opts.brandName, leftX, cursorY + brandSize)
  cursorY += brandSize * 1.55

  // Línea decorativa
  ctx.fillStyle = accent
  const lineW = W * 0.14
  ctx.fillRect(leftX - lineW / 2, cursorY, lineW, Math.max(4, W * 0.004))
  cursorY += H * 0.025

  // Titular gancho (dopamina)
  if (opts.headline.trim()) {
    const headlineSize = fitFontSize(ctx, opts.headline, contentW, Math.round(W * 0.062), '800', FONT)
    ctx.fillStyle = accent
    ctx.font = `800 ${headlineSize}px ${FONT}`
    ctx.fillText(opts.headline, leftX, cursorY + headlineSize)
    cursorY += headlineSize * 1.5
  }

  // Subtítulo
  if (opts.subline.trim()) {
    const sublineSize = fitFontSize(ctx, opts.subline, contentW, Math.round(W * 0.032), '500', FONT)
    ctx.fillStyle = theme.subTextColor
    ctx.font = `500 ${sublineSize}px ${FONT}`
    ctx.fillText(opts.subline, leftX, cursorY + sublineSize)
    cursorY += sublineSize * 2.1
  }

  // ─── Tarjeta blanca con QR ───
  // Espacio restante reservado: CTA + etiqueta de mesa abajo (~16% de H)
  const bottomReserved = H * 0.16
  const availableH = H - cursorY - bottomReserved
  const cardPad = W * 0.045
  const maxCardSide = Math.min(W * 0.72, availableH)
  const qrSide = Math.round(maxCardSide - cardPad * 2)
  const cardSide = qrSide + cardPad * 2
  const cardX = (W - cardSide) / 2
  const cardY = cursorY + (availableH - cardSide) / 2

  ctx.save()
  ctx.shadowColor = theme.cardShadow
  ctx.shadowBlur = W * 0.035
  ctx.shadowOffsetY = W * 0.008
  ctx.fillStyle = theme.cardBg
  drawRoundedRect(ctx, cardX, cardY, cardSide, cardSide, W * 0.035)
  ctx.fill()
  ctx.restore()

  // QR
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: qrSide,
    margin: 1,
    color: { dark: accent, light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  })
  const qrImg = await loadImage(qrDataUrl)
  const qrX = cardX + cardPad
  const qrY = cardY + cardPad
  ctx.drawImage(qrImg, qrX, qrY, qrSide, qrSide)

  // Logo overlay (centro del QR)
  if (opts.logoDataUrl) {
    const logoImg = await loadImage(opts.logoDataUrl)
    const logoSize = qrSide * 0.22
    const logoX = qrX + (qrSide - logoSize) / 2
    const logoY = qrY + (qrSide - logoSize) / 2
    const bgPad = qrSide * 0.015
    ctx.fillStyle = '#FFFFFF'
    drawRoundedRect(ctx, logoX - bgPad, logoY - bgPad, logoSize + bgPad * 2, logoSize + bgPad * 2, logoSize * 0.12)
    ctx.fill()
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize)
  }

  // ─── CTA + etiqueta de mesa ───
  let footY = cardY + cardSide + H * 0.045
  const ctaText = 'Sólo escanea el QR y regístrate'
  const ctaSize = fitFontSize(ctx, ctaText, contentW, Math.round(W * 0.036), '700', FONT)
  ctx.fillStyle = theme.textColor
  ctx.font = `700 ${ctaSize}px ${FONT}`
  ctx.fillText(ctaText, leftX, footY + ctaSize)
  footY += ctaSize * 1.8

  if (opts.label.trim()) {
    const labelSize = fitFontSize(ctx, opts.label, contentW * 0.6, Math.round(W * 0.05), '800', FONT)
    ctx.fillStyle = accent
    ctx.font = `800 ${labelSize}px ${FONT}`
    ctx.fillText(opts.label, leftX, footY + labelSize)
  }

  return canvas.toDataURL('image/png')
}
