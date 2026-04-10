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
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Error creando cliente: ${error.message}`)
  }

  return data
}

export async function incrementVisit(customerId: string, currentVisits: number): Promise<Customer> {
  const supabase = getServiceClient()
  const newVisits = currentVisits + 1

  const { data, error } = await supabase
    .from('customers')
    .update({
      total_visits: newVisits,
      last_visit_at: new Date().toISOString(),
    })
    .eq('id', customerId)
    .select()
    .single()

  if (error) {
    throw new Error(`Error actualizando visitas: ${error.message}`)
  }

  return data
}
