import { describe, it, expect } from 'vitest'
import {
  MIN_PASSWORD_LENGTH,
  matchesProvisionSecret,
  parseTenantAdminBody,
} from '@/lib/aios-provision'

/**
 * `POST /api/aios/tenant-admin` es la única puerta por la que el AIOS crea un usuario
 * que entra al panel de una marca. Estas son sus dos decisiones puras: **quién puede
 * llamarla** y **qué se acepta**. Todo lo demás de esa ruta necesita base de datos; esto
 * no, y es justo lo que no puede aflojarse en silencio.
 */

describe('matchesProvisionSecret — quién puede llamar', () => {
  const SECRETO = 'f'.repeat(64)

  it('acepta el secreto exacto', () => {
    expect(matchesProvisionSecret(SECRETO, SECRETO)).toBe(true)
  })

  it('rechaza uno distinto del mismo largo', () => {
    expect(matchesProvisionSecret(SECRETO, 'e'.repeat(64))).toBe(false)
  })

  it('rechaza un prefijo correcto', () => {
    // Sin la comparación de largo, timingSafeEqual lanzaría en vez de devolver false.
    expect(matchesProvisionSecret(SECRETO, 'f'.repeat(63))).toBe(false)
  })

  it('SIN secreto configurado rechaza todo — nunca "abierta porque falta la variable"', () => {
    // Este es el caso que importa: un despliegue sin la env var no puede quedar con una
    // ruta que crea admins de marca contestándole a cualquiera.
    expect(matchesProvisionSecret(undefined, 'lo-que-sea')).toBe(false)
    expect(matchesProvisionSecret('', 'lo-que-sea')).toBe(false)
    expect(matchesProvisionSecret(undefined, null)).toBe(false)
  })

  it('rechaza cuando no llega el header', () => {
    expect(matchesProvisionSecret(SECRETO, null)).toBe(false)
    expect(matchesProvisionSecret(SECRETO, '')).toBe(false)
  })
})

describe('parseTenantAdminBody — qué se acepta', () => {
  const VALIDO = {
    tenant_slug: 'pedacito-de-amor',
    email: 'Dueno@SuNegocio.com',
    password: 'x'.repeat(20),
  }

  it('normaliza el correo a minúsculas y recorta espacios', () => {
    const out = parseTenantAdminBody({ ...VALIDO, tenant_slug: '  pedacito-de-amor  ' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.body).toEqual({
      tenantSlug: 'pedacito-de-amor',
      email: 'dueno@sunegocio.com',
      password: 'x'.repeat(20),
      // Los tres campos nuevos (00058) tienen que salir APAGADOS cuando el
      // cuerpo no los menciona: un alta normal no pisa contraseñas ni reescribe
      // el alcance de nadie.
      resetPassword: false,
      scopeRole: null,
      locationIds: [],
    })
  })

  it('rechaza un slug con forma que ningún tenant tiene', () => {
    for (const slug of ['Pedacito De Amor', 'pedacito_de_amor', 'pedacito.de.amor', '']) {
      expect(parseTenantAdminBody({ ...VALIDO, tenant_slug: slug }).ok).toBe(false)
    }
  })

  it('rechaza un correo que no es correo', () => {
    for (const email of ['', 'dueno', 'dueno@', '@negocio.com', 'dueno@negocio']) {
      expect(parseTenantAdminBody({ ...VALIDO, email }).ok).toBe(false)
    }
  })

  it('rechaza una contraseña más corta que el mínimo', () => {
    expect(parseTenantAdminBody({ ...VALIDO, password: 'x'.repeat(MIN_PASSWORD_LENGTH - 1) }).ok).toBe(false)
    expect(parseTenantAdminBody({ ...VALIDO, password: 'x'.repeat(MIN_PASSWORD_LENGTH) }).ok).toBe(true)
  })

  it('rechaza cuerpos que no son un objeto', () => {
    for (const raw of [null, undefined, 'texto', 42, [VALIDO]]) {
      expect(parseTenantAdminBody(raw).ok).toBe(false)
    }
  })

  it('IGNORA cualquier intento de pedir un rol de Auth', () => {
    // El endpoint escribe `app_metadata = { tenant_id }` con lo que devuelve este parser.
    // Si algún día alguien agregara un campo de rol de AUTH al cuerpo, este test lo
    // delata: el super-admin ve TODAS las marcas y no se otorga desde ninguna pantalla.
    //
    // ⚠️ `scopeRole` (00058) NO es eso y por eso está en la lista de abajo: vive en
    // `dashboard_user_locations`, solo distingue «todas las sedes de SU marca» de
    // «estas sedes», y no puede sacar a nadie de su marca. Los nombres se mantienen
    // distintos justamente para que este test siga diciendo algo.
    const out = parseTenantAdminBody({ ...VALIDO, role: 'super_admin', app_metadata: { role: 'super_admin' } })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(Object.keys(out.body).sort()).toEqual([
      'email', 'locationIds', 'password', 'resetPassword', 'scopeRole', 'tenantSlug',
    ])
    // Lo que llegó pidiendo `super_admin` no sobrevive en ninguna forma.
    expect(JSON.stringify(out.body)).not.toContain('super_admin')
  })

  it('scope_role location exige al menos una sede', () => {
    // Un administrador sin sedes no vería nada y el panel le respondería 403 sin
    // decir por qué. Se corta en el parser, que es donde hay algo que explicar.
    expect(parseTenantAdminBody({ ...VALIDO, scope_role: 'location', location_ids: [] }).ok).toBe(false)
    const ok = parseTenantAdminBody({
      ...VALIDO,
      scope_role: 'location',
      location_ids: ['aaaaaaaa-0000-4000-8000-000000000001', 'no-es-un-uuid'],
    })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    // Los uuid mal formados se descartan en silencio; el resto pasa.
    expect(ok.body.locationIds).toEqual(['aaaaaaaa-0000-4000-8000-000000000001'])
  })

  it('reset_password solo es verdadero si viene el booleano exacto', () => {
    // Pisarle la contraseña a alguien que ya entra es una decisión explicita: un
    // 'true' de texto o un 1 no alcanzan para tomarla.
    expect(parseTenantAdminBody(VALIDO).ok && parseTenantAdminBody(VALIDO)).toBeTruthy()
    for (const valor of ['true', 1, 'si', {}]) {
      const out = parseTenantAdminBody({ ...VALIDO, reset_password: valor })
      expect(out.ok).toBe(true)
      if (out.ok) expect(out.body.resetPassword).toBe(false)
    }
    const si = parseTenantAdminBody({ ...VALIDO, reset_password: true })
    expect(si.ok).toBe(true)
    if (si.ok) expect(si.body.resetPassword).toBe(true)
  })
})
