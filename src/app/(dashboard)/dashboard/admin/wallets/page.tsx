import { redirect } from 'next/navigation'
import { isSuperAdmin } from '@/lib/admin'
import { SuperAdminWallets } from '@/components/dashboard/SuperAdminWallets'

/**
 * Panel de billeteras (SOLO super-admin).
 *
 * Donde el operador de Cada1 asigna saldo a cada tenant ("me dieron 50k, les
 * asigno 50k") y ve quién está por quedarse sin mensajes. Puente hasta que
 * exista el autoservicio con pasarela (Wompi).
 *
 * Ref: docs/features/wallet-billing.md
 */
export default async function AdminWalletsPage() {
  // Gate server-side: un admin de tenant no debe ver las billeteras de los demás.
  if (!(await isSuperAdmin())) {
    redirect('/dashboard')
  }
  return <SuperAdminWallets />
}
