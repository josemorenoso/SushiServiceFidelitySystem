import { createClient } from '@supabase/supabase-js'
import type { Visit } from '@/types/database.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key)
}

export async function createVisit(params: {
  customerId: string
  source: 'qr' | 'delivery'
  notes?: string
  address?: string
  paymentMethod?: string
  amount?: number
  rawMessage?: string
  tableNumber?: number | null
}): Promise<Visit> {
  const supabase = getServiceClient()
  const insertPayload: Record<string, unknown> = {
    customer_id: params.customerId,
    source: params.source,
    notes: params.notes ?? null,
    address: params.address ?? null,
    payment_method: params.paymentMethod ?? null,
    amount: params.amount ?? null,
    raw_message: params.rawMessage ?? null,
  }
  // Only include table_number if present (requires migration 00009)
  if (params.tableNumber != null) {
    insertPayload.table_number = params.tableNumber
  }

  const { data, error } = await supabase
    .from('visits')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    throw new Error(`Error registrando visita: ${error.message}`)
  }

  return data
}

export async function getRecentVisit(customerId: string, withinMinutes: number = 60): Promise<boolean> {
  const supabase = getServiceClient()
  const since = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('visits')
    .select('id')
    .eq('customer_id', customerId)
    .eq('source', 'qr')
    .gte('created_at', since)
    .limit(1)

  if (error) {
    throw new Error(`Error verificando visita reciente: ${error.message}`)
  }

  return (data?.length ?? 0) > 0
}
