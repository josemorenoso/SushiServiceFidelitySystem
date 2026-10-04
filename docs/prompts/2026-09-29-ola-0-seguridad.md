# Prompt — Ola 0 de la auditoría: cerrar los agujeros entre marcas (2026-09-29)

> Pegar entero (desde la raya) en una sesión NUEVA de Claude Code abierta en la raíz del repo del producto.
> Modelo: Sonnet (`/model sonnet`). Origen: `docs/AUDITORIA-ESCALA-1000-2026-09-28.md` §1 y §6, y
> `ESTADO.md` §3 0.SEGURIDAD. El dueño confirmó el 29 que todas las migraciones están aplicadas.

## Antes de pegar: lo que hace el dueño en el SQL Editor de Supabase (no espera a la sesión)

```sql
-- (a) AISLA-2 está VIVO: cerrar las dos funciones a la anon key. El AIOS usa aios_constelarys y no lo nota.
REVOKE ALL ON FUNCTION public.aios_attach_zernio_account(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aios_list_locations(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aios_attach_zernio_account(text, text, text, text) TO aios_constelarys;
GRANT EXECUTE ON FUNCTION public.aios_list_locations(text) TO aios_constelarys;

-- (b) ¿Corrió la 00015? Si devuelve filas, clientes y visitas de TODAS las marcas están abiertos a la anon key.
SELECT tablename, policyname, roles, cmd FROM pg_policies
WHERE tablename IN ('customers', 'visits') AND policyname LIKE 'service_role_%';
--     Si devolvió filas, cerrarlo ya (el service role no las usa: se salta RLS):
-- DROP POLICY IF EXISTS "service_role_select_customers" ON customers;
-- DROP POLICY IF EXISTS "service_role_insert_customers" ON customers;
-- DROP POLICY IF EXISTS "service_role_update_customers" ON customers;
-- DROP POLICY IF EXISTS "service_role_select_visits"    ON visits;
-- DROP POLICY IF EXISTS "service_role_insert_visits"    ON visits;

-- (c) ¿Corrió la 00030? 0 filas = el DEFAULT puente a Sushi Service ya no existe (avisarle a la sesión).
SELECT table_name, column_default FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'tenant_id' AND column_default IS NOT NULL;

-- (d) Verificación después de (a): ninguna aios_* debería decir true (los helpers de RLS sí, por diseño).
SELECT p.oid::regprocedure AS funcion,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY 1;
```

Lo que devuelvan (b) y (c) se lo contás a la sesión en el primer mensaje.

---

Leé `ESTADO.md` y seguí el ritual de `METODO_MAESTRO_LUISRAI.md` § 3.1: anotá tu territorio en el § 2 y commitealo
solo antes de tocar nada. Después leé `docs/AUDITORIA-ESCALA-1000-2026-09-28.md` §1 y §6: ahí está cada agujero con su
cadena de `ruta:línea`, verificada por un refutador y releída por Opus.

## TAREA
Cerrar la ola 0 de la auditoría: que ningún camino deje leer o escribir datos de una marca desde otra (ni desde
afuera), más cuatro arreglos chicos que no esperan.
- **AISLA-1:** `POST /api/mystery-box/resolve` solo otorga, a un cliente de la marca del host, un nivel de ESA marca
  que `GET /api/check-in/status` le ofrecería en ese momento (alcanzado y sin reclamar), y con límite de tasa. Hoy da
  premios sin límite y con niveles de cualquier marca.
- **AISLA-2 y OPUS-4:** ninguna función `SECURITY DEFINER` de `public` es ejecutable por `anon` ni `authenticated`
  (la 00067 y la 00057 corrieron con un REVOKE incompleto), y las cinco políticas `service_role_*` de la 00015 no
  existen, se haya aplicado o no. Todo en una migración nueva e idempotente, que sirva aunque el dueño ya haya
  corrido el SQL de arriba a mano.
- El CSV de logs de la raíz (`logs-*.csv`, con datos personales) no puede entrar al repo.
- **OPER-4:** un administrador de sede no puede escribir los ajustes de la marca por `PUT /api/dashboard/settings`.
- **AISLA-5:** el secreto de `/api/webhook/delivery` se compara en tiempo constante.
- **ALTA-7** (repo del AIOS, `Level 2.0/aios-constelarys`): el wizard dice la espera real de Meta (24-72 h), no «horas».

## GUARDRAILS
- Solo tus archivos, por nombre. Sin cambiar de rama, sin stash, sin `reset --hard`, y nunca `git add -A`: hay un CSV
  con datos personales en la raíz.
- Las migraciones aplicadas no se editan (corrieron todas): el cierre va en una migración NUEVA, con el número de
  `node scripts/proxima-migracion.mjs` anotado en tu fila del § 2.
- «Ya reclamado» es la regla que ya usa `check-in/status` (`claimed_tier_key` / `claimed_threshold`, 00059, ya
  aplicada; `docs/features/points-mystery-box.md` §7.1.bis): una sola fuente de verdad, no una segunda.
- No cambies qué claves acepta `settings` ni el flujo de plantillas (eso es 0.PLANTILLAS), ni el contrato de
  `/api/webhook/delivery` (n8n lo llama): mismo header y mismas respuestas.
- El CSV no se borra ni se mueve sin preguntarme: basta con que git lo ignore.
- En el AIOS, solo ese texto, con su `CHANGELOG.md` y su versión patch.
- Fuera de esta ola, no los toques: ESCALA-3 (el webhook de Zernio con OpenAI adentro) y ESCALA-4 (la analítica
  truncada en 1000 filas) van en su propia sesión.
- Una corrida de vitest a la vez. Nada de push ni de aplicar migraciones: eso es del dueño.

## CRITERIO DE TÉRMINO
- **AISLA-1** tiene un test que falla antes del arreglo y pasa después: un nivel de otra marca y un nivel ya
  reclamado se rechazan sin escribir `mystery_box_results` ni `reward_grants` y sin mandar WhatsApp, y el camino
  legítimo sigue otorgando.
- **AISLA-2 y OPUS-4** tienen un test de base que, con los privilegios por defecto de Supabase emulados en el arnés,
  falla si una `SECURITY DEFINER` de `public` es ejecutable por `anon`/`authenticated` fuera de una lista explícita
  de helpers de RLS, y falla si existen las políticas de la 00015. Falla sin la migración nueva y pasa con ella.
- **OPER-4** tiene su test (administrador de sede → 403; marca → 200). `git check-ignore` confirma el CSV ignorado.
- `tsc` limpio, lint sin errores nuevos y la suite entera en verde; en el AIOS, `tsc` y lint limpios en lo tocado.
- Docs en el mismo commit: `docs/features/points-mystery-box.md` y `docs/03-security.md` cuentan el cambio;
  `ESTADO.md` (0.SEGURIDAD cerrado o con lo que falte, y el orden del deploy: qué migración aplicar antes del push);
  `CHANGELOG.md` ≤ 15 líneas (y el del AIOS); la auditoría §6 marca cerrado lo que cerraste.
- Grafo: `graphify.exe` lo bloquea el Control de aplicaciones de Windows, pero el módulo corre:
  `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify query "…"` (y `update .` al
  cerrar). El hook post-commit ya lo reconstruye solo.
- Resumen en diez líneas y una línea que me pida el push con el hash y la migración que va antes.
