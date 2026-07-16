/**
 * Zona horaria de operación del negocio.
 *
 * Los crons corren en UTC en el servidor (Vercel). Cualquier FECHA que se le muestre al
 * cliente —una fecha límite en un WhatsApp, un día en el dashboard— debe formatearse
 * explícitamente en esta zona: sin `timeZone`, `toLocaleDateString` usa la del servidor
 * (UTC) y de noche en Colombia el resultado se adelanta un día calendario.
 */
export const APP_TIMEZONE = 'America/Bogota'
