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

  it('IGNORA cualquier intento de pedir un rol: solo salen slug, correo y contraseña', () => {
    // El endpoint escribe `app_metadata = { tenant_id }` con lo que devuelve este parser.
    // Si algún día alguien agregara un campo `role` al cuerpo, este test lo delata: el
    // super-admin ve TODAS las marcas y no se otorga desde ninguna pantalla.
    const out = parseTenantAdminBody({ ...VALIDO, role: 'super_admin', app_metadata: { role: 'super_admin' } })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(Object.keys(out.body).sort()).toEqual(['email', 'password', 'tenantSlug'])
  })
})
