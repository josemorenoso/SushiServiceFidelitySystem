import { redirect } from 'next/navigation'

/**
 * Ruta vieja. El catálogo de premios de campaña se mudó a la pestaña
 * "Premios" dentro de Campañas (2026-09-08) — ver
 * `src/components/dashboard/CampaignRewardsCatalog.tsx`. Esta página queda
 * como redirección para que ningún enlace guardado (Ajustes, favoritos) rompa.
 */
export default function CampaignRewardsPage() {
  redirect('/dashboard/campaigns?tab=premios')
}
