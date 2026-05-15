import { createClient } from '@supabase/supabase-js'
import type { Customer } from '@/types/database.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(url, key)
}

export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', phone)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Error buscando cliente: ${error.message}`)
  }

  return data
}

export async function createCustomer(params: {
  phone: string
  name: string
  birthday: string | null
  city: string | null
  source?: 'qr' | 'delivery'
  accepts_marketing?: boolean
}): Promise<Customer> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('customers')
    .insert({
      phone: params.phone,
      name: params.name,
      birthday: params.birthday,
      city: params.city,
      total_visits: 1,
      last_visit_at: new Date().toISOString(),
      source_channels: params.source ?? 'qr',
      accepts_marketing: params.accepts_marketing ?? true,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Error creando cliente: ${error.message}`)
  }

  return data
}

export async function incrementVisit(customerId: string, currentVisits: number, source?: 'qr' | 'delivery'): Promise<Customer> {
  const supabase = getServiceClient()
  const newVisits = currentVisits + 1

  // If source provided, update source_channels accordingly
  const updateData: Record<string, unknown> = {
    total_visits: newVisits,
    last_visit_at: new Date().toISOString(),
  }

  if (source) {
    // Fetch current source_channels to determine if we need to upgrade to 'both'
    const { data: current } = await supabase
      .from('customers')
      .select('source_channels')
      .eq('id', customerId)
      .single()

    const currentSource = current?.source_channels ?? 'qr'
    if (currentSource !== 'both' && currentSource !== source) {
      updateData.source_channels = 'both'
    } else if (currentSource !== 'both') {
      updateData.source_channels = source
    }
  }

  const { data, error } = await supabase
    .from('customers')
    .update(updateData)
    .eq('id', customerId)
    .select()
    .single()

  if (error) {
    throw new Error(`Error actualizando visitas: ${error.message}`)
  }

  return data
}

export async function updateCustomerCityIfNull(customerId: string, city: string): Promise<void> {
  const supabase = getServiceClient()
  await supabase
    .from('customers')
    .update({ city })
    .eq('id', customerId)
    .is('city', null)
}

export async function updateCustomerBirthdayIfNull(customerId: string, birthday: string): Promise<void> {
  const supabase = getServiceClient()
  await supabase
    .from('customers')
    .update({ birthday })
    .eq('id', customerId)
    .is('birthday', null)
}
