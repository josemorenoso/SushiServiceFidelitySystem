# Tepuy: borrar las dos marcas y rehacerla como una sola, con dos sedes

**2026-09-08.** Tepuy quedó dado de alta como **dos marcas separadas** en vez de un negocio
con dos locales. No fue un error de operación: el alta salió con el AIOS **v1.5.2**, que
llamaba `aios_provision_tenant` **una vez por cada sede**. La v1.6.0 arregla exactamente eso
y quedó desplegada unos minutos después.

```
main del AIOS = c962f27 (v1.5.2)   desde el 07 a las 19:47
  01:48   se crea  clubtepuylaureles      ← con la versión vieja
  01:53   "añadir sede" → clubtepuyenvigado    ← con la versión vieja
  01:56   main pasa a 4a5e01b (v1.6.0 + v1.7.0)
  ~01:59  Vercel termina de construir    ← recién acá existe el arreglo
```

**Decisión del dueño (2026-09-08):** se borran las dos y se rehace el alta como **una marca
con dos sedes**, compartiendo **un solo número de WhatsApp**. Es lo que la v1.6.0 vino a
habilitar y lo mismo que vas a repetir con los 25.

## Lo que no se puede mover

Los QR **ya están impresos** con estos dos hosts, así que el alta nueva los vuelve a usar
**tal cual** — pero como dominio de cada **SEDE**, no de una marca:

```
clubtepuylaureles.constelarys.com   →  sede Laureles
clubtepuyenvigado.constelarys.com   →  sede Envigado
```

**Y por eso la marca estrena un tercer host, `clubtepuy.constelarys.com`, que no se imprime.**
No es capricho: [`pickLocationForHost()`](../../src/lib/location-resolver.ts#L136) dice, textual,
que *el dominio raíz manda aunque la sede principal repita ese mismo dominio*, y con 2+ sedes
el raíz deja de atribuir y pide elegir sede. Si dejáramos el host de Laureles como dominio de
la **marca**, ese QR impreso pasaría a preguntarle «¿en qué sede estás?» a cada cliente. El
tercer host es la página de "elegí tu sede" para quien llega sin QR (un enlace de WhatsApp,
Google, un link guardado). Con un solo local no hace falta ninguno: el raíz *es* la sede — por
eso las 5 marcas vivas nunca tuvieron que reimprimir nada.

---

# El paso a paso

## Paso 1 — Mirar que estén vacías (producto)

[`00-VERIFICAR.sql`](00-VERIFICAR.sql) en **supabase.com → proyecto del PRODUCTO → SQL Editor →
New query → pegar → Run**. Solo lee.

> **Si sale un solo cliente o una sola visita, PARÁ y avisá.** Borrar una marca con historia
> es otra cosa y este script se niega a hacerlo.

## Paso 2 — Borrar las dos marcas (producto)

[`01-BORRAR-TENANTS.sql`](01-BORRAR-TENANTS.sql), mismo SQL Editor del producto.

Borra las dos con todo lo suyo y **libera los dos subdominios**. Aborta solo si aparece un
dato o si alguna tiene un WhatsApp conectado. También borra el usuario de panel que hayas
creado para ellas (al final se crea de nuevo, con contraseña nueva a la vista).

> **Esto borra y no hay marcha atrás.** Si querés red: Supabase → Database → Backups →
> snapshot antes. Son dos marcas recién nacidas: el snapshot es barato.

## Paso 3 — Dejar el AIOS listo (⚠️ el OTRO Supabase)

[`02-RESET-AIOS.sql`](02-RESET-AIOS.sql) en **el Supabase del AIOS**. Es el error fácil de
cometer: los otros tres van en el del producto.

**No borra las sedes.** Conserva nombre, dirección, mensualidad, fecha y cobros: solo deshace
el paso 2 del asistente y deja al propietario en modo «varias sedes». No retecleás nada.

## Paso 4 — Rehacer el alta en el AIOS

Abrí el AIOS → Clientes → **Tepuy**. Vas a ver las dos sedes con el paso 2 otra vez pendiente.

**4.a — Sede Laureles → "Crear el tenant".** Dos campos, exactamente así:

| Campo | Qué poner |
|---|---|
| Slug del tenant | `clubtepuy` |
| Dominio | `clubtepuy.constelarys.com` |

Esos dos son de la **MARCA**. El subdominio de la sede sale solo del que ya tiene la fila
(`clubtepuylaureles.constelarys.com`) — no lo toques.

**4.b — Sede Envigado → "Engancharse a la marca".** Elegí `clubtepuy`. **No crees un tenant
nuevo**: ese botón es el que existía roto y es lo que partió Tepuy en dos. Su subdominio
(`clubtepuyenvigado.constelarys.com`) también sale solo.

**4.c — Verificar el dominio** en las dos sedes (paso 3 del asistente).

**4.d — WhatsApp: UNA sola vez.** Va en la ficha del **propietario**, no en la de cada sede —
un número para las dos, que es lo que pidió la clienta.

**4.e — Usuario del panel.** En cualquiera de las dos sedes (es la misma marca), tarjeta
«Usuario del panel» → correo de la clienta → copiar la contraseña. Se muestra **una sola vez**.

## Paso 5 — Comprobar (producto)

[`03-VERIFICAR-FINAL.sql`](03-VERIFICAR-FINAL.sql). Cuatro ✓. La que más importa es la 2:
que los dos hosts impresos son sedes de la marca.

## Paso 6 — Probarlo con el celular

Abrí los dos subdominios y hacé un check-in de prueba en cada uno. Cada visita tiene que
quedar en **su** sede. Después, la clienta tiene que **iniciar sesión de cero** en el panel:
la marca viaja dentro del token, refrescar no alcanza.

---

## El número compartido

Un solo número para las dos sedes es el modelo por defecto y el que decidiste el 2026-09-05
(D6): **N líneas por marca, y la sede no obliga a ninguna**. Por eso el paso 4.d va en el
propietario. Si algún día hiciera falta un número por sede, eso es la fase **F9** —
`location_messaging`, cupo por línea y **plantillas por línea**, porque cada número es una
línea de WhatsApp Business con sus propias 13 plantillas aprobadas por Meta. No está hecha.
