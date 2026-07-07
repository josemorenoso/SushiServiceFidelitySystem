import { createClient } from '@supabase/supabase-js'
import { validatePhone } from '@/lib/validators/phone'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key)
}

/**
 * Checks if a phone number is an authorized sender (mesero).
 * The phone comes from Twilio in format "whatsapp:+573001234567".
 */
export async function isAuthorizedNumber(twilioFrom: string, tenantId: string): Promise<boolean> {
  const cleaned = extractPhoneFromTwilio(twilioFrom)
  if (!cleaned) return false

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('authorized_numbers')
    .select('id')
    .eq('phone', cleaned)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('[Delivery] Error verificando número autorizado:', error.message)
    return false
  }

  return !!data
}

/**
 * Extracts a Colombian phone from Twilio's "whatsapp:+57XXXXXXXXXX" format.
 * Returns the 10-digit number or null.
 */
export function extractPhoneFromTwilio(twilioPhone: string): string | null {
  const match = twilioPhone.match(/\+57(\d{10})/)
  if (match) {
    const { valid, cleaned } = validatePhone(match[1])
    return valid ? cleaned : null
  }
  return null
}

/**
 * Extracts a Colombian phone number from the message body.
 * Tries multiple patterns:
 * 1. Explicit 10-digit number starting with 3
 * 2. Number with country code +57
 * 3. Number with spaces/separators
 */
export function extractClientPhoneFromMessage(body: string): string | null {
  if (!body) return null

  const cleaned = body.replace(/[\n\r]/g, ' ')

  // Pattern 1: +57 followed by 10 digits
  const withCountryCode = cleaned.match(/\+57\s*(3\d{9})/)
  if (withCountryCode) {
    return withCountryCode[1]
  }

  // Pattern 2: 10-digit Colombian mobile (standalone)
  const standalone = cleaned.match(/(?:^|\s|:)(3\d{9})(?:\s|$|,|\.|\)|-)/m)
  if (standalone) {
    return standalone[1]
  }

  // Pattern 3: 10 digits with separators (e.g. 300-123-4567, 300 123 4567)
  const withSeparators = cleaned.match(/(?:^|\s)(3\d{2}[\s\-.]?\d{3}[\s\-.]?\d{4})(?:\s|$|,|\.|\))/m)
  if (withSeparators) {
    const digits = withSeparators[1].replace(/[\s\-.]/g, '')
    const { valid } = validatePhone(digits)
    if (valid) return digits
  }

  // Pattern 4: any 10 digits starting with 3 found anywhere
  const anyMatch = cleaned.match(/(3\d{9})/)
  if (anyMatch) {
    return anyMatch[1]
  }

  return null
}
