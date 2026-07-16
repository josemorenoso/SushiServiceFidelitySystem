/**
 * Constantes de la billetera prepagada por tenant.
 *
 * Centraliza la TRM (antes hardcodeada en dos archivos distintos:
 * imported-contacts.service.ts y api/dashboard/twilio-balance/route.ts) y la
 * tarifa por defecto. La TRM SOLO se usa para el reporte de margen del
 * super-admin: al tenant se le cobra en COP a tarifa fija, así que el riesgo
 * cambiario se queda del lado del operador (spec §1.2).
 *
 * Ref: docs/superpowers/specs/2026-07-13-wallet-billing-design.md
 */

/** TRM USD→COP para el cálculo de margen del super-admin. Override por env. */
export const USD_TO_COP = Number(process.env.USD_COP_RATE) || 4200

/** Costo real de un mensaje WhatsApp en USD: Meta $0.0125 + Twilio $0.005. */
export const MESSAGE_COST_USD = 0.0175

/** Costo real de un mensaje en COP (a la TRM actual). Referencia de margen. */
export const MESSAGE_COST_COP = Math.round(MESSAGE_COST_USD * USD_TO_COP)

/**
 * Tarifa por defecto que paga el tenant por mensaje (COP).
 * Espejo del DEFAULT de la columna tenants.price_per_message_cop (migración 00033).
 * A $100 el margen es ~26% sobre el costo real y "50,000 = 500 mensajes".
 */
export const DEFAULT_PRICE_PER_MESSAGE_COP = 100

/**
 * Paquetes de recarga (COP) para el autoservicio (Wompi, Bloque 5).
 * Los "mensajes" de cada paquete se DERIVAN de la tarifa del tenant, no se
 * hardcodean aquí (W-D1).
 */
export const TOPUP_PACKAGES_COP = [50_000, 100_000, 200_000, 500_000] as const
