# Tepuy: dos marcas que tienen que ser una, sin mover los QR impresos

**2026-09-08.** Tepuy quedó dado de alta como **dos marcas separadas** en vez de un negocio
con dos locales. No fue un error de operación: el alta salió con el AIOS **v1.5.2**, que
llamaba `aios_provision_tenant` **una vez por cada sede**. La v1.6.0 arregla exactamente eso
y quedó desplegada unos minutos después.

```
main del AIOS = c962f27 (v1.5.2)   desde el 07 a las 19:47
  01:48   se crea  clubtepuylaureles     ← con la versión vieja
  01:53   "añadir sede" → clubtepuyenvigado   ← con la versión vieja
  01:56   main pasa a 4a5e01b (v1.6.0 + v1.7.0)
  ~01:59  Vercel termina de construir   ← recién acá existe el arreglo
```

**Por qué importa:** un cliente que come en los dos locales queda como **dos personas con
puntos separados** (`customers_phone_tenant_key` garantiza una ficha por MARCA), y el número
de WhatsApp **no se puede compartir** — `idx_tenants_zernio_account_id` rechaza el segundo
tenant, y hace bien.

## La restricción que manda: los QR ya están impresos

```
clubtepuylaureles.constelarys.com   →  tiene que seguir sirviendo, sede Laureles
clubtepuyenvigado.constelarys.com   →  tiene que seguir sirviendo, sede Envigado
```

Por eso esos dos hosts pasan a ser el `domain` de las **sedes**, no de la marca:
`resolveHostContext()` resuelve la marca por el subdominio de una sede y
`pickLocationForHost()` le da `source='host'` — atribución exacta y sin preguntarle nada
al cliente.

**Y por eso la marca estrena un tercer host, `clubtepuy.constelarys.com`.** No es capricho:
`pickLocationForHost()` dice, textual, que *el dominio raíz manda aunque la sede principal
repita ese mismo dominio*, y con 2+ sedes el raíz deja de atribuir y pide elegir sede (D21).
Si dejáramos el host de Laureles como dominio de la MARCA, el QR impreso de Laureles pasaría
a preguntarle «¿en qué sede estás?» a cada cliente. Ese tercer host **no se imprime en
ningún lado**: es solo la raíz.

## El estado al que se llega

| | slug | domain |
|---|---|---|
| **Marca** | `clubtepuy` — "Tepuy" | `clubtepuy.constelarys.com` (raíz, no impreso) |
| Sede 1 | `laureles` — "Laureles" | `clubtepuylaureles.constelarys.com` ← **QR impreso** |
| Sede 2 | `envigado` — "Envigado" | `clubtepuyenvigado.constelarys.com` ← **QR impreso** |

## Los cuatro pasos, en orden

| # | Archivo | Dónde | Qué hace |
|---|---|---|---|
| 0 | `00-VERIFICAR.sql` | Supabase del **producto** | Solo lee. **Si sale un solo cliente o una sola visita, PARÁ**: fundir marcas con historia es otro problema y este script no lo resuelve |
| 1 | `01-FUNDIR.sql` | Supabase del **producto** | El arreglo. Un solo bloque: si algo no cuadra, aborta y no deja nada a medias |
| 2 | `02-VERIFICACION-FINAL.sql` | Supabase del **producto** | Cinco ✓. Cualquier ✗ es un problema |
| 3 | `03-AIOS.sql` | Supabase del **AIOS** ⚠️ | Pone al AIOS de acuerdo: propietario en modo `multi` y sus dos sedes sobre la misma marca |

⚠️ **El paso 3 va en el OTRO Supabase.** Es el error fácil de cometer.

## Después

1. **Abrí los dos subdominios en el celular** y hacé un check-in de prueba en cada uno.
   Cada visita tiene que quedar en su sede.
2. **El usuario del panel tiene que volver a iniciar sesión.** La marca viaja dentro del
   token: refrescar no alcanza. Si el usuario apuntaba a la marca borrada, el paso 1 ya lo
   repuntó a la que queda.
3. **El WhatsApp se conecta UNA vez, sobre la marca** — no una por sede. Ese era el otro
   motivo de todo esto.

## Marcha atrás

No hay automática: el paso 1 **borra** la marca sobrante. Por eso aborta ante el primer dato.
Si querés red extra, tomá un snapshot en Supabase → Database → Backups antes de correr el
paso 1: son dos marcas recién nacidas, el snapshot es barato y el borrado es definitivo.
