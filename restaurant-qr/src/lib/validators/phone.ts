/**
 * Validates a Colombian phone number (10 digits, starts with 3).
 * Strips whitespace and common separators before validation.
 */
export function validatePhone(phone: string): { valid: boolean; cleaned: string } {
  const cleaned = phone.replace(/[\s\-().+]/g, '')

  // Colombian mobile: 10 digits starting with 3
  const isValid = /^3\d{9}$/.test(cleaned)

  return { valid: isValid, cleaned }
}

/**
 * Formats a Colombian phone number for WhatsApp (Twilio format).
 * Input: "3001234567" → Output: "whatsapp:+573001234567"
 */
export function formatPhoneForWhatsApp(phone: string): string {
  const { cleaned } = validatePhone(phone)
  return `whatsapp:+57${cleaned}`
}
