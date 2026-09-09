/**
 * Quién puede mandarle los domicilios de un número a qué sede.
 *
 * Vive aparte de la ruta a propósito, por la misma razón que
 * `puedeEscribirEnLaMarca()`: es una decisión **pura** y se puede probar sin levantar un
 * handler ni `next/headers`. `location-scope.ts` no se toca — de ahí solo se lee el tipo.
 *
 * La regla que protege: `authorized_numbers.location_id` es la señal autenticada de la que
 * sale la sede de un pedido (`resolveDeliveryLocation()`). Cambiarla redirige la atribución
 * de todo lo que entre por ese celular, así que un **administrador de sede** no puede
 * apuntarla a un local que no administra — la FK compuesta `(location_id, tenant_id)` de la
 * 00043 solo frena la otra MARCA, no la sede hermana.
 *
 * Ref: docs/features/delivery-webhook.md · docs/features/multi-sede.md (§5.1, D9)
 */

import type { LocationScope } from '@/lib/location-scope'

export type DecisionSedeDestino =
  | { ok: true }
  | { ok: false; status: 403; error: string; message: string }

/**
 * ¿Puede quien llama dejar este número en `destino`?
 *
 * @param destino La sede pedida, o `null` para «sede desconocida».
 */
export function decidirSedeDestino(
  scope: Pick<LocationScope, 'allowedLocationIds' | 'canSeeUnassigned'>,
  destino: string | null
): DecisionSedeDestino {
  if (destino === null) {
    // Devolverlo al cubo «sin sede» solo lo puede hacer quien puede VER ese cubo. Para un
    // `role='location'` la fila desaparecería de su propio panel en el mismo acto (§5.1:
    // nunca ve `location_id IS NULL`), o sea que perdería el número sin forma de
    // recuperarlo. Fail-closed.
    if (!scope.canSeeUnassigned) {
      return {
        ok: false,
        status: 403,
        error: 'Sede requerida',
        message: 'No puedes dejar un número sin sede: dejarías de verlo. Elige una de tus sedes.',
      }
    }
    return { ok: true }
  }

  // `allowedLocationIds` son las sedes ACTIVAS que este usuario puede ver: para la marca,
  // todas las de la marca; para un administrador de sede, las suyas. Una sede inactiva, o
  // inexistente, tampoco está en la lista — y no debería estarlo: atribuirle domicilios a un
  // local cerrado es un error de dedo, no una intención.
  if (!scope.allowedLocationIds.includes(destino)) {
    return {
      ok: false,
      status: 403,
      error: 'Sede inválida',
      message: 'Esa sede no existe, no está activa, o no es una de las que administras.',
    }
  }

  return { ok: true }
}
