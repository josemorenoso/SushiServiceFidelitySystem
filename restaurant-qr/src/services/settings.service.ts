import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export async function getSettingValue(key: string): Promise<string | null> {
  const supabase = getServiceClient()
  const { data } = await supabase.from('admin_settings').select('value').eq('key', key).single()
  return data?.value ?? null
}

export async function getMultipleSettings(keys: string[]): Promise<Record<string, string>> {
  const supabase = getServiceClient()
  const { data } = await supabase.from('admin_settings').select('key, value').in('key', keys)
  const result: Record<string, string> = {}
  for (const row of data ?? []) {
    result[row.key] = row.value
  }
  return result
}
