/**
 * Devuelve un emoji representativo según la posición del tier.
 * Usa sort_order / index en lugar del nombre, para soportar
 * cualquier nombre que el admin configure (Plata, Oro, Diamante, etc.)
 */
export function getTierEmoji(index: number, isBlack: boolean): string {
  if (isBlack) return '🖤'
  const emojis = ['🥉', '🥈', '🥇', '💎', '👑', '⭐', '🎯']
  return emojis[index] ?? '🎯'
}
