import { redirect } from 'next/navigation'

/**
 * Ruta vieja. El catálogo de premios para regalar vive en Recompensas › Premios para regalar
 * desde 2026-10-13 (S-1; antes fue la pestaña «Premios» de Campañas, desde 2026-09-08). Esta
 * página queda como redirección para que ningún enlace guardado (Ajustes, favoritos) rompa.
 */
export default function CampaignRewardsPage() {
  redirect('/dashboard/rewards?tab=premios')
}
