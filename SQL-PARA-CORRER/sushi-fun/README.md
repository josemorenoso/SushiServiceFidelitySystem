# SQL para absorber Sushi Fun

**No pegues nada de acá sin leer antes [`docs/RUNBOOK-ABSORBER-SUSHI-FUN.md`](../../docs/RUNBOOK-ABSORBER-SUSHI-FUN.md).**

## Dónde va cada archivo

| Archivo | Base | Escribe |
|---|---|---|
| `CONTEO-ORIGEN.sql` | ⚠️ **Supabase de SUSHI FUN** | no |
| `00-PREVUELO.sql` | Supabase **principal** | no |
| `01-alta-tenant-y-sede.sql` | principal | **sí** — hay que llenar sus parámetros |
| `02-catalogo.sql` … `07-mensajes.sql` | principal | sí |
| `08-VERIFICACION-FINAL.sql` | principal | no |
| `09-ACTIVAR.sql` | principal | sí — **el interruptor final** |
| `99-ROLLBACK.sql` | principal | sí — deshace todo |

Se corren **en orden numérico**, uno a la vez, esperando el `OK` de cada uno. Cada archivo abre su
propia transacción: si falla, se deshace solo.

## Tres cosas que hay que saber

1. **Los datos son una foto** (2026-09-06 01:41). Sushi Fun sigue vivo. Corré `CONTEO-ORIGEN.sql`
   antes de empezar; si algo creció, hay que regenerar:
   ```
   SUSHIFUN_URL=… SUSHIFUN_SERVICE_KEY=… node scripts/gen-sushi-fun-dump.mjs
   ```

2. **El 02–08 son GENERADOS.** No los edites a mano: se pierde al regenerar. El `00`, `01`, `09`,
   `99` y este README sí están escritos a mano.

3. **El `01` aborta si dejás alguna columna de Twilio en NULL.** No es un descuido del archivo: con
   NULL, los WhatsApp de Sushi Fun salen desde el número de Sushi Service. El porqué está en el
   encabezado del propio `01`.

## Ensayar antes

```
node scripts/probar-absorcion-sushi-fun.mjs
```

Corre los nueve archivos y el rollback contra un Postgres desechable con las migraciones
00001–00045. No toca ninguna base viva. Tarda ~1 min.
