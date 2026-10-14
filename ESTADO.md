# ESTADO — RestaurantQR / Cada1

> **Última actualización:** 2026-10-13 (**SEG-2 y SEG-3 cerrados en código**: dos `resolve` simultáneos ya no otorgan dos premios —lo frena la base, migración **00072 escrita, SIN aplicar**— y la tarjeta, el logo, el link de reseñas de la marca, el píxel y su token los cambia un super usuario, no un administrador de sede; **sin pushear**; tsc limpio, 86 archivos / 1.373 tests → §3 0.SEGURIDAD); antes 2026-10-13 (**S-1, Recompensas en un solo lugar**: el catálogo y «para qué se usa cada premio» viven en Recompensas › Premios para regalar, salieron de Campañas y de Ajustes, las invitaciones eligen del catálogo y las escrituras del catálogo exigen alcance de marca; **sin migración, sin pushear**; tsc limpio, 85 archivos / 1.360 tests → §5); antes 2026-10-13 (**ciclo, FASE 1B construida**: el cron decide y encola, el drenador envía y otorga; migración **00071 escrita, SIN aplicar**; **sin pushear**; el ciclo sigue apagado en todas las marcas; tsc limpio, 82 archivos / 1.277 tests → §3 0.CICLO, con lo del dueño en orden); antes 2026-10-12 (**PUSH a `main` de la 1A + plantillas «un solo libro» + PL-2-a** por orden del dueño, `feef4e6`, Vercel READY; antes del push: tsc limpio, 80 archivos / 1.202 tests; **consultas 1 y 2 de la 1A leídas**: Sushi Fun no tiene visitas perdidas —su 2,4 % es real— y la foto del ciclo salió como se esperaba → §3 0.CICLO); antes 2026-10-12 (**PL-2-a**: el recordatorio de premio y «Nivel desbloqueado» del check-in no usan una plantilla Twilio sin aprobar —sin migración, **sin desplegar**—; **la 00070 queda APLICADA** por el dueño el 12-10; suite entera 80 archivos / 1202 → §3 0.PLANTILLAS y 0.CICLO); antes 2026-10-11 (**plantillas: un solo libro y una sola pantalla** —el panel reconoce la WABA, «Nivel desbloqueado», «Recordatorio de premio» y «Regalo que vence» entran juntas (16), una pantalla para Twilio y Zernio con Biblioteca para campañas, Ajustes ya no asigna punteros, N5-bis—; sin migración, **sin desplegar**; suite entera con la 1A: 78 archivos / 1175 → §3 0.PLANTILLAS); antes 2026-10-11 (**ciclo, FASE 1A construida**: migración **00070** (aplicada el 12-10), motor puro, motor de piezas, 9 ajustes `cycle_*`; nada se envía y el ciclo nace apagado; al dueño: consulta 1 → 00070 (hecha el 12-10) → consulta 2 → §3 0.CICLO); antes 2026-10-11 (**el dueño DECIDIÓ los bloques A y B** del ciclo y de plantillas, con datos reales de producción: ritmo personal por cliente y ritmo de la marca calculado, cuatro ritmos validados, motor de piezas para sumar comunicaciones, sin Wallet, piloto en Don Alirio, la segunda visita como métrica; feature nueva `docs/features/ritmo-adaptativo.md`; spec §14; prompt de la fase 1A listo → §3 0.CICLO; solo docs); antes 2026-10-11 (**P1-a: arreglos chicos de campañas y plantillas** —N3-quater, N7, N8, OPER-4, N5, N16, N23, OPER-6—, sin migración, **sin desplegar**; tsc limpio, 71 archivos / 1017 tests → §5); antes 2026-10-11 (**fases 0 y 0.bis del ciclo PUSHEADAS a `main` = `2746d49` por orden del dueño**, sin migración; tsc limpio y 65 archivos / 929 tests en verde antes del push → §3 0.CICLO); antes 2026-10-10 (**ciclo, FASE 0.bis construida** —tope de 3 intentos fallidos por toque, la causa real del fallo en `error_message`, lo que salió queda marcado aunque la corrida aborte, el estimador da 500 y no «0», Clientes y «Rescatar Perdidos» con los días de la marca—; sin migración, **sin desplegar: la 0 y la 0.bis van JUNTAS** → §3 0.CICLO, con la línea base del SQL); antes 2026-10-08 (**ciclo, FASE 0 construida** —un envío fallido ya no calla, el insistente sale una vez mientras el cliente no vuelva, una sola escala de días, el texto de Campañas dice la verdad—; sin migración, **sin desplegar**; al dueño solo le queda correr `SQL-PARA-CORRER/ciclo-fase-0/` → §3 0.CICLO); antes 2026-10-08 (**`docs/PENDIENTES.md`: TODO lo pendiente en un solo documento** —orden de trabajo, gestos, olas y las preguntas al dueño con su default, bloques A–D—; tercera pasada del ciclo contra el código: siete correcciones H1–H7 en el spec §13 y en el prompt de la fase 1; solo docs); antes 2026-10-04 (DISEÑO del ciclo de recuperación —campañas + calendario en una pantalla, pipeline por ritmo del negocio, fatiga a las 6, «regalos que vencen»—: spec, prototipo y prompt, sin código; **segunda pasada con la revisión del dueño aplicada** → §3 0.CICLO); antes 2026-10-04 (cumpleaños resuelto y DESPLEGADO: plantilla nueva «Cumpleaños — dos días antes», cambio solo por marca al aprobarse; `main` y la rama vuelven a ser lo mismo → §3 0.CUMPLE); antes 2026-10-04 (consolidado de los requerimientos de agosto y la auditoría de 1000 clientes, solo docs, verificado contra el código: `docs/ESTADO-CONSOLIDADO-2026-10-04.md`; antes, el mismo día: ESCALA-3 y ESCALA-4 DESPLEGADAS: `main` = `9a06670`, Vercel READY, sin migración — el webhook de Zernio contesta antes de la IA y la analítica pagina → §3 0.ESCALA; la ola 0 también está en `main`, falta aplicar la 00069); antes 2026-10-03 (ola 0 de seguridad construida: `0485098` + migración **00069**, sin aplicar y sin desplegar; el SQL a mano del 29 corrió en el Supabase del AIOS, NO en el del producto → AISLA-2 sigue vivo: §3 0.SEGURIDAD); antes 2026-09-29 (el dueño confirma TODAS las migraciones aplicadas → AISLA-2 está VIVO y la 00015 queda por confirmar: §3 0.SEGURIDAD; docs que mentían corregidos; prompt de la ola 0 en `docs/prompts/2026-09-29-ola-0-seguridad.md`); antes 2026-09-28 (auditoría «qué falta para 1000 clientes», solo lectura: dos agujeros entre marcas → §3 0.SEGURIDAD, la 00067 y la 00057 NO se aplican tal cual; `docs/AUDITORIA-ESCALA-1000-2026-09-28.md`); antes 2026-09-25 (los domicilios del AUTO-CHAT de la propia línea: `message.sent` + `tenant_connections.self_conversation_id`, **00068 APLICADA y PUSHEADO a main** por orden del dueño — `8be572e`; **cumpleaños NO se desplegó, queda en la rama**; antes 2026-09-24: el saludo de cumpleaños sale dos días antes: `BIRTHDAY_LEAD_DAYS`, dedup a 360; sin migración, sin desplegar; antes 2026-09-12: interruptor «Domicilios por WhatsApp» en la ficha de la sede del AIOS, 00066 APLICADA, AIOS v1.12.0 pusheado; antes: Golden Bullet por tandas desde el panel: la base entera se guarda, pestaña «Bases», `POST /continue`, sin migración; antes: Autorizados Domicilio dentro de Domicilios, pusheado `1de033e`; Planeta Wings: timeout de Auth, estado por plantilla y registro en Cloud API en el AIOS; prompt de plantillas una por una; Opus 5)
> Toda sesión lo lee PRIMERO. Toda sesión que cierra un bloque lo ACTUALIZA al final. Límite: 150 líneas.
> Lo obsoleto se **saca**, no se tacha: un ítem tachado sigue costando tokens cada vez que alguien lee esto.
>
> **Sus hermanos:**
> - **[docs/PENDIENTES.md](docs/PENDIENTES.md) — la lista ÚNICA de lo que falta** (2026-10-08): orden de trabajo, gestos del dueño y todas las preguntas abiertas con su valor por defecto. **Empezar ahí.**
> - [docs/RUNBOOK-DEPLOY.md](docs/RUNBOOK-DEPLOY.md) — los pasos exactos del despliegue, en orden, verificados contra el código.
> - [docs/ESTADO-CONSOLIDADO-2026-10-04.md](docs/ESTADO-CONSOLIDADO-2026-10-04.md) — los 224 pedidos de agosto (§0–§25) y los 68 hallazgos de la auditoría, verificados contra el código el 04-10, con la propuesta de prioridades. Ahí vive **qué falta desarrollar**. (Reemplaza a `docs/ESTADO-REQUERIMIENTOS.md`, del 06-09.)

---

## 1. Foto actual

| Qué | Estado |
|-----|--------|
| Código | **La rama va por delante de `origin/main`, SIN pushear (2026-10-13):** el prompt de la 1B (`fd28e72`, `599e455`), la fila del tablero (`9f6f093`), la fase 1B del ciclo (`d685c68`) y su cierre de docs, **S-1, Recompensas en un solo lugar** (`a367beb` + su cierre de docs; sin migración) y **SEG-2 y SEG-3** (`526f4a0`, `87ebac9` + su cierre; migración **00072**). **El push lleva la 00071, que va ANTES** (§3 0.CICLO), **y la 00072, que conviene antes** (ningún orden rompe nada; §3 0.SEGURIDAD). Antes: **`origin/main` = `origin/feat/multisede-aios` = la rama** (push 2026-10-12, orden del dueño «pushea ya todo a main»): la fase 1A del ciclo (00070 aplicada ANTES, el 12-10), plantillas «un solo libro» y PL-2-a. Antes del push: árbol limpio, tablero vacío, `origin/main` ancestro, tsc limpio, **80 archivos / 1.202 tests**. **Vercel `cada1` READY en producción: `dpl_Fh1gLUgZJ7rMXSXBXuoYiELY9U7F` (`feef4e6`).** Ojo al mirarlo: con el plan Hobby los builds van de a uno; el de producción esperó en cola ~2,5 min detrás de la vista previa de la rama y **no aparecía en la lista mientras esperaba**. No falta: espera. Antes **`origin/main` = `56544f6`** (P1-a, 11-10). Antes **`origin/main` = `origin/feat/multisede-aios` = `2746d49`** (push 2026-10-11, orden del dueño, fast-forward: fases 0 y 0.bis del ciclo + docs; sin migración; **Vercel `cada1` READY en producción**, `dpl_Bhs6jCWTnTuVcDuktCTDoGLzbDeR`). Antes: **`main` y `feat/multisede-aios` vuelven a ser LA MISMA historia** (2026-10-04, orden del dueño: «pushea» el cumpleaños). Un merge con el árbol de la rama, que ya estaba probado entero (61 archivos / 889 tests). Antes de unir se comprobó con `merge-tree` que `main` no aportaba nada que la rama no tuviera: solo chocaban `ESTADO`, `CHANGELOG` y `dashboard.md`, docs que la rama ya tenía más nuevos. Entraron a producción el cumpleaños (septiembre + la plantilla nueva) y las plantillas del 02-10 (`9514c2b`, `0b4ec8e`). **Desde acá, un push de la rama a `main` vuelve a ser fast-forward.** Antes **`origin/main` = `ff9fd90`** (HOTFIX 2026-10-04, `4907512` de la rama: con ESCALA-4 desplegada la analítica daba **500 en las 5 marcas** —el panel en ceros— porque «cumpleaños hoy» hacía `LIKE` sobre `birthday` (`date`, 42883); ahora se cuenta en memoria. Producción se volvió a `c055e8e` con un rollback de Vercel mientras se arreglaba; verificado en worktree: tsc limpio, **59 archivos / 863 tests**. ⚠️ **Después de un rollback, Vercel deja de publicar solo los push a `main`: el `ff9fd90` se promovió A MANO**, y con esa promoción volvió a publicar solo (el `c41da76` tomó los dominios sin ayuda). Si un push no aparece en los dominios de las marcas tras un rollback, es eso: promoverlo en Vercel). Antes **`origin/main` = `9a06670`** (push 2026-10-04 por orden del dueño: ESCALA-3 y ESCALA-4, el `bb177cd` de la rama rehecho sobre `c055e8e` por `cherry-pick` limpio; verificado en un worktree con `npm ci` propio, ya borrado: tsc limpio, lint 7 errores = base de `main`, **59 archivos / 864 tests**; Vercel `cada1` READY en ~40 s con los alias de producción —`hooks.constelarys.com` incluido— y un POST con firma inválida al webhook contesta 401). La rama conserva `bb177cd` y su cierre `d71311a`; los docs de seguimiento (`ESTADO`, `CHANGELOG`, auditoría) viven solo en la rama, como con la ola 0. Antes **`origin/main` = `c055e8e`** (push 2026-10-04 por orden del dueño: SOLO la ola 0 de seguridad, rehecha sobre `8be572e` como `e287817` + `c055e8e` = `0485098` + `ddfdf72` de la rama; verificado en un worktree con `npm ci` propio: tsc limpio, lint 7 errores = base de `main`, **56 archivos / 824 tests**; Vercel `cada1` en producción). **Siguen SIN desplegar** el cumpleaños y los arreglos de plantillas del 02-10 (`9514c2b`, `0b4ec8e`). AIOS: `origin/main` = `b1b2465` (v1.13.2). Antes **`origin/main` = `8be572e`** (push 2026-09-25 por orden del dueño: SOLO el auto-chat de domicilios — los 4 commits de `message.sent` + la 00068 + el script de Zernio; Vercel lo despliega solo). ⚠️ **LEER ESTO ANTES DE PUSHEAR:** `main` y `feat/multisede-aios` **YA NO SON LO MISMO**. El dueño pidió desplegar lo del auto-chat y dejar el cumpleaños sin desplegar, y los 3 commits de cumpleaños estaban DEBAJO de los 4 del auto-chat en la historia. Así que los 4 del auto-chat se rehicieron sobre `origin/main` (SHAs nuevos: `0513c69 e299f6c 7f829a9 8be572e`) y se pushearon; la rama conserva los originales (`d9bda05 371123b b93b2e5 f6ed9d5`) **más** los 3 de cumpleaños. El contenido de código es IDÉNTICO (verificado archivo por archivo); lo único que difiere son `ESTADO.md` y `CHANGELOG.md`, donde la versión de `main` no menciona cumpleaños. **Un `git push feat/multisede-aios:main` ahora NO es fast-forward y no hay que forzarlo.** Para desplegar el cumpleaños cuando su plantilla esté lista: rehacer los 3 commits sobre `origin/main` igual que se hizo con estos (worktree, `cherry-pick`, resolver `ESTADO`/`CHANGELOG`, pushear). Respaldo del árbol completo anterior al push: rama local `respaldo/antes-push-autochat-2026-09-25` (`f6ed9d5`). Antes `2bfae49` (push 2026-09-12 por orden del dueño: Golden Bullet por tandas desde el panel, sin migración; Vercel lo despliega solo; antes `1de033e`: Autorizados Domicilio como pestaña de Domicilios, sin migración; antes `27e4ae2`, docs del Golden Bullet, y `8cf5ed4`: nombre editable de plantillas en Meta, `ac686b8`; antes `05b7eb8`) (pusheado el 2026-09-12 por orden del dueño: **`712ff58` Golden Bullet por Zernio con la marca en Twilio** —código, sin migraciones; Vercel lo despliega solo; el puente necesita `ZERNIO_API_KEY` y `ZERNIO_WEBHOOK_SECRET` en el Vercel del producto— más docs. Antes, el mismo día: solo docs —prompt de plantillas, `zernio-messaging.md`, este archivo— sobre `d38319c`, el drenador a 240 s/20 en paralelo; antes `9c34760` a las 06:00, por orden del dueño: Golden Bullet por tandas con la plata a la vista, foto en el mensaje 1, prueba a un celular, nombre genérico al lado del mensaje, los tres textos editables y `{nombre|alternativo}`; antes, `a55f574` a las 03:45: el flag, el Toaster y el normalizador de celulares). Antes, `d47ade8` + su commit de docs (02:30: rendimiento del equipo, 00065 **aplicada antes**). Antes, en el mismo día: `76d99b7` (AIOS + 00064, plantillas) y `3278f66` (invitaciones, 00063). **Local = remoto.** La carpeta sigue en `feat/multisede-aios` (= `main`). Sin mergear a propósito: `master`, `port/sushi-fun-2.8`, `sushi-sync`. **Variables que el código desplegado espera en Vercel:** `TWILIO_MASTER_TENANT_ID` (RUNBOOK §1.b'; sin ella Sushi Service deja de enviar por Twilio) y las tres de Meta (§1.b'', no bloquean) |
| Verificación | ✅ 2026-10-13 (**SEG-2 y SEG-3**, árbol completo, última sesión viva): `tsc` limpio · eslint 14 errores = la base (7 de `src/` + su copia en `.kilo/worktrees`), ninguno en lo tocado · **suite entera: 86 archivos / 1.373 tests en verde**. SEG-2 y SEG-3 aportan 2 archivos y 32 tests; **contra el código anterior caen 16**: 10 de los 17 de `tests/db/mystery-box-carrera.test.ts` (la ruta real daba 6 premios por 6 llamadas), 1 de los 2 nuevos de `mystery-box-resolve` y 5 de los 13 de `tenant-config-permisos`. Antes, ✅ 2026-10-13 (**S-1**, árbol completo, con SEG-2 de la otra sesión ya commiteado): `tsc` limpio · eslint 14 errores = la base, ninguno en lo tocado · **suite entera: 85 archivos / 1.360 tests en verde** (S-1 aporta 2 archivos y 63 tests; contra el código anterior caen 20 de los 63 —los otros 43 son la lógica pura y la salvaguarda de lo que no cambió—). Antes, ✅ 2026-10-13 (**ciclo 1B**, árbol completo): `tsc` limpio · eslint 14 errores = los 7 de `src/` + su copia en `.kilo/worktrees`, ninguno en lo tocado · **suite entera: 82 archivos / 1.277 tests en verde** (+2 archivos y +75 tests; con el código anterior los dos archivos nuevos no cargan, y con solo el módulo puro nuevo presente caen 38 de 75). Antes, ✅ 2026-10-12 (**PL-2-a**, árbol completo): `tsc` limpio · eslint 14 errores = los 7 de `src/` + su copia en `.kilo/worktrees`, ninguno en lo tocado · **suite entera: 80 archivos / 1202 tests en verde** (+2 archivos y +27 tests; 16 de los 27 fallan contra `89c6380`). Antes, ✅ 2026-10-11 (**cierre de las dos sesiones juntas**, plantillas + ciclo 1A, árbol completo): `tsc` limpio · eslint 14 errores = los 7 preexistentes de `src/` + su copia en `.kilo/worktrees`, ninguno en lo tocado · **suite entera: 78 archivos / 1175 tests en verde** · de plantillas, 47 de 146 tests caen contra el código anterior (`56544f6`). Antes, ✅ 2026-10-11 (ciclo fase 1A, con la sesión de plantillas EN CURSO en la misma carpeta): `tsc` limpio (proyecto entero) · eslint 14 errores = los preexistentes, ninguno en lo tocado · **suite entera: 75 archivos / 1130 tests, 1129 en verde**; el único rojo, `p1a-settings-claves` («31 ≥ 44»), era del trabajo sin commitear de plantillas (sacó la sección de Ajustes) y esa sesión lo ajustó en su fila · los 3 archivos de la 1A (101 tests) caen contra el código anterior. La corrida final con las dos sesiones cerradas la hace la última que cierre. Antes, ✅ 2026-10-11 (P1-a, rama completa): `tsc` limpio · eslint 14 errores = los preexistentes, ninguno en lo tocado · **suite entera: 71 archivos / 1017 tests en verde** (+6 archivos y +88 tests; 24 fallan contra `2746d49`). Antes, ✅ 2026-10-10 (ciclo fase 0.bis, rama completa): `tsc` limpio · eslint 14 errores = los preexistentes, ninguno en lo tocado · **suite entera: 65 archivos / 929 tests en verde** (+2 archivos y +18 tests; 16 de los 18 fallan contra `4043421`). Antes, ✅ 2026-10-08 (ciclo fase 0, rama completa): `tsc` limpio · eslint 14 errores = los preexistentes, ninguno en lo tocado · **suite entera: 63 archivos / 911 tests en verde** (+2 archivos y +22 tests; 18 de los 22 fallan contra el código anterior). Antes, ✅ 2026-10-04 (ESCALA-3/4, rama completa): `tsc` limpio · eslint 14 errores = los preexistentes, ninguno en lo tocado · **suite entera: 61 archivos / 881 tests en verde** (+3 archivos y +40 tests: los de esas dos tareas); sus tests fallan contra el código anterior (el de ESCALA-3, contra una copia de la ruta vieja). **Sobre el árbol de `main` + `bb177cd` (worktree, antes del push):** `tsc` limpio · eslint 7 errores = la base de `main`, ninguno en lo tocado · **59 archivos / 864 tests en verde**. En vivo solo se comprobó el 401 del POST con firma inválida; **NO verificado**: un pedido real por Zernio (<5 s) ni la analítica con la base real. Antes, ✅ 2026-10-03 (ola 0, rama completa): `tsc` limpio · eslint 14 errores = los preexistentes, ninguno en lo tocado · **suite entera: 58 archivos / 841 tests en verde**; AIOS `tsc` y eslint limpios en lo tocado. Antes, ✅ 2026-09-25 **sobre el árbol que se pusheó a main** (no sobre la rama): `tsc` limpio · **suite entera: 53 archivos / 805 tests en verde** (los 9 que faltan contra la rama son los de cumpleaños, que no van). Sobre la rama completa, el mismo día: `tsc` limpio · **54 archivos / 814 tests en verde** · eslint sin nada nuevo (los 14 errores son los preexistentes, ninguno en lo tocado). Antes, ✅ 2026-09-12 (00066 + AIOS v1.12.0): producto `tsc` limpio, `tests/db/aios-delivery-webhook.test.ts` 6/6 sobre Postgres real (aplica las 62 migraciones, la 00066 incluida); AIOS `tsc` limpio y eslint limpio en lo tocado. La suite entera NO se corrió (solo el archivo nuevo). Antes, ✅ 2026-09-12 (Golden Bullet por tandas): `tsc` limpio · eslint limpio en lo tocado (los 7 errores del proyecto son los preexistentes) · **suite entera: 50 archivos / 787 tests en verde**. Antes, ✅ 2026-09-11 (06:00): `tsc` limpio · lint limpio en lo tocado · **suite entera: 48 archivos / 756 tests en verde** · eslint **7 errores preexistentes** (hooks y gráficas del panel, ninguno en lo tocado). El rojo de `aios-health` era del RELOJ (el helper mete dos pedidos con `now() - 1h`/`- 2h`, así que entre medianoche y las 2 a.m. el segundo cae en el día anterior): a esta hora pasa. Sigue sin corregirse. `build` no se corrió |
| Marcas vivas | **8** (consulta 2 de la 1A, 2026-10-12): sushi-service (670 clientes), demo-ventas (408, `is_demo`), don-alirio (336), sushi-fun (289), clubplanetawingsenvigado (64), clubtepuy (39, ya registra sin WhatsApp), cafe-frangal (8) y **clubvipmakabro (1, nueva: ningún doc la menciona todavía)** |
| Base de datos de producción | ⏳ **La 00071 (ciclo 1B) está escrita y SIN aplicar** (2026-10-13): va ANTES del push que la lleva. ⏳ **La 00072 (SEG-2) también** (2026-10-13): después de la 00071 y antes del push; antes, la consulta de solo lectura de `SQL-PARA-CORRER/seg-2-carrera-resolve/` (no la frena: informa cuántos premios de más ya se regalaron). ✅ **Todas las anteriores aplicadas, según el dueño (2026-09-29)**, incluidas las que figuraban escritas sin aplicar: `00057`, `00058`, `00059`, `00061`, `00064` y `00067`. ⚠️ **Con la 00067 y la 00057 aplicadas, AISLA-2 está VIVO** (su REVOKE dejó EXECUTE a `anon`), y **sigue vivo**: el SQL a mano del 29 se corrió en el Supabase del AIOS (§3 0.SEGURIDAD). Lo cierra la **00069** (escrita el 03-10, **sin aplicar**). ⚠️ **Por confirmar con SQL** (0.SEGURIDAD): si «todas» incluyó la `00015` —NO se aplica: sus políticas `USING (true)` sin `TO service_role` abren clientes y visitas de TODAS las marcas a la anon key— y la `00030` (quita el DEFAULT puente; hasta hoy nunca aplicada, a propósito). Del Supabase del AIOS: la `00010` **está aplicada** (su función aparece en el catálogo, 03-10); la `00009`, sin confirmar. Huecos: `00048`, `00049`, `00052`, `00055` |
| Migraciones: dónde están | El directorio muestra **solo la rama puesta**; el inventario real y el número de la próxima los da `node scripts/proxima-migracion.mjs`. **Desde el 07 la única reserva es la fila del tablero (§2)**: un número citado en cualquier otro doc no reserva nada. `00048`, `00049`, `00052` y `00055` son huecos: no se rellenan |
| Crons | Los 6 en `vercel.json` (los 5 de campañas + `line-health` cada hora), corriendo. `birthday` 18:00 y `reactivation` 20:00 UTC (= 13:00/15:00 Bogotá), verificado. **`birthday` saluda a quien cumple DENTRO DE DOS DÍAS** (`BIRTHDAY_LEAD_DAYS`, dueño 2026-09-24), no a quien cumple hoy. ⚠️ **`reward-reminder` sigue en 16:00 UTC (11:00 Bogotá)**; la auditoría estimó ≈21:00 UTC. **Decisión del dueño** |
| n8n | Apagado. `domicilios_whatsapp_v4.json` sigue en el VPS pero ya no dispara |
| AIOS (`Level 2.0/aios-constelarys`) | **`origin/main` = `b3b4a1b` (v1.15.1, 2026-10-08) — YA está pusheado** (comprobado con `git fetch` el 12-10; este renglón decía «sin pushear»): link único `/conectar/[token]` para que el cliente conecte WhatsApp (necesita `AIOS_CONNECT_LINK_SECRET` en su Vercel), y la compra de números de Colombia arreglada (mandaba `mobile`; CO solo ofrece `local`). Tiene grafo propio desde hoy (solo código, hook post-commit).** Antes **`origin/main` = `f489ad9` (v1.14.0, 2026-10-04: el alta crea «Cumpleaños — dos días antes» en vez de «¡Feliz cumpleaños!»; antes `b1b2465` v1.13.2, 24-72 h)**. Antes **`origin/main` = `c7e6dd5` (v1.13.1: el wizard del propietario aparece con la sede en Twilio, sin cambiar el selector; v1.13.0, pusheado el 2026-09-12 por orden del dueño; Vercel `cada1_aios` lo despliega solo)**: «4-bis. Zernio en paralelo (solo la difusión)» en la sede en Twilio — `aios_attach_zernio_account`, **necesita la 00067 del producto** (sin ella dice «esa función todavía no existe»). Antes, `6323ced` (v1.12.0): interruptor «Domicilios por WhatsApp» de la marca en la tarjeta Sistema de la sede (`getDeliveryWebhook`/`setDeliveryWebhook`, `actions/delivery.ts`), sobre la **00066 del producto, ya aplicada**. Encima de `5108550` (v1.11.3: `getTemplateStatus` lee `template.status`, el 500 de `/clientes/[id]` por `toLowerCase`) y `c70f348` (docs contrato §8). Antes, **`origin/main` = `62e8c13` (v1.11.2, pusheado el 2026-09-12 por orden del dueño; Vercel `cada1_aios` lo despliega solo)**: paso 3 con botón «Registrar número en Cloud API» (coexistencia deja el número «sin registrar»; nunca se llamaba `POST …/whatsapp/register`); el paso 4 guarda y muestra el estado de CADA plantilla (aprobada/pendiente/rechazada + motivo) — antes un rechazo era invisible para siempre; y la lista resuelve `_v2`. Planeta Wings: 13 creadas a las 00:17 UTC, 0/13 aprobadas 4 h después, estado real desconocido hasta desplegar esto o mirar el WhatsApp Manager. Antes, **`origin/main` = `1a9f558` (v1.11.1, pusheado el 2026-09-11 23:55)**: un `Gateway Timeout` de Supabase Auth ya no te saca al login en medio de una acción (pasó en el alta de Planeta Wings al apretar «Crear plantillas»: el paso 4 nunca corrió; es reintentar, no un bug del paso). Antes, `c8a1917` (v1.11.0): borrar propietario entero, lista Twilio \| Zernio con recarga, reinicio de WhatsApp, Embedded Signup que se anota solo (00010 del AIOS, sin aplicar), `ZERNIO_SIMULATE` solo con `true`. Necesita la **00064 del producto** aplicada y `ZERNIO_API_KEY` vigente en su Vercel. Antes: **`origin/main` = `b6fd308` (v1.10.0), pusheado el 2026-09-10**: las 13 plantillas copiadas del producto (sin 🍣, emoji por rubro), media de muestra desde `ZERNIO_TEMPLATE_SAMPLE_{IMAGE,VIDEO}_URL` **del Vercel del AIOS** (las dos son obligatorias o el paso 4 no arranca), y nombres `_v2` cuando el base ya existe en la WABA |
| Grafo | Docs re-extraídos el 2026-09-29 (Haiku por `claude-cli`, incremental, ~2 M tokens de la suscripción) + `cluster-only` + `label`: **5.860 nodos, 10.780 aristas, 543 comunidades**. El hook post-commit reconstruye el código solo en cada commit. ⚠️ **`graphify.exe` lo bloquea el Control de aplicaciones de Windows**: se usa el módulo, `/c/Users/luisr/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe -m graphify query "…"` (y `update .`, `extract`, `label`). 8 docs viejos no dieron nodos nuevos (`scalability-analysis.md`, `DELEGACION_GUIDE.md` y otros 6: conservan los del 08) |
| Deadline | ~2026-09-10 — onboarding de los 25 clientes de Zernio |

## 2. En vuelo ahora mismo

> **Es el TABLERO.** Una fila por sesión viva, anotada y commiteada sola ANTES de tocar nada; se borra al cerrar.
> Dos filas no comparten archivo. La migración escrita acá es su ÚNICA reserva. Regla: `CLAUDE.md` § "modo simple".

| Sesión (qué, quién, cuándo) | Modelo | Archivos / carpetas que toca | Migración | Estado |
|---|---|---|---|---|

## 3. Siguiente, en orden

0.SEGURIDAD **Ola 0: DESPLEGADA el 2026-10-04 (`main` = `c055e8e`; AIOS `b1b2465` v1.13.2). La 00069 la aplicó el
   dueño el 2026-10-11** en el Supabase del producto (sin reportar error). **La 00030 NO corrió:** la consulta (c) del
   11-10 devolvió el DEFAULT puente `a1b2c3d4-…` en 18 tablas (`customers`, `visits`, `campaigns`, `campaign_messages`,
   `admin_settings`, `message_logs`, `restaurant_locations`, `staff_users`…): la regla de `CLAUDE.md` sigue viva. Cerrado en código, cada uno con un test que falla contra el código viejo: AISLA-1 (`resolve` solo
   otorga lo que `check-in/status` ofrece), AISLA-2 y OPUS-4 (migración **00069**), OPER-4 (`PUT` de settings con
   alcance de marca), AISLA-5 (`timingSafeEqual`), el CSV (`logs-*.csv` ignorado; el archivo sigue en la raíz) y
   ALTA-7. Detalle: `docs/AUDITORIA-ESCALA-1000-2026-09-28.md` §7. **Lo que falta, del dueño y en este orden:**
   1. ~~La 00069~~ — aplicada el 2026-10-11. Si el dueño ve algún día «siguen ejecutables por anon/authenticated: X»,
      X es una función que no está en el repo: pasársela a una sesión.
   2. ~~Desplegar~~ — hecho el 04 (§1, Código). El código no necesita la 00069; la 00069 cierra un agujero vivo.
      `ESTADO.md`, `CHANGELOG.md` y la auditoría §7 viven solo en la rama (en `main` quedaron las versiones viejas).
   **SEG-2 y SEG-3, lo que la ola dejó abierto: CERRADOS EN CÓDIGO el 2026-10-13** (`526f4a0`, `87ebac9`), sin pushear.
   SEG-2: dos `resolve` simultáneos del mismo cliente otorgaban dos premios y dos WhatsApp; ahora un trigger con candado
   por cliente (00072) rechaza el segundo reclamo del mismo nivel —la regla de `elegirNivelSinReclamar()`— y la ruta
   contesta 409 sin otorgar (`points-mystery-box.md` §7.4.ter). SEG-3: `PUT tenant-config`, `brand-logo` y el token de
   `meta-conversions` exigen alcance de marca; Tarjeta principal y Configuración lo dicen en español
   (`multi-sede.md` §3.septies punto 7). **Lo del dueño, en este orden:**
   3. **La consulta de solo lectura** del paso 1 de `SQL-PARA-CORRER/seg-2-carrera-resolve/LEEME.md` y traer el
      resultado (aunque sean 0 filas). Si hay premios de más sin entregar, qué hacer con ellos es decisión suya.
   4. **La 00072** (Supabase del producto, después de la 00071): tiene que decir `OK 00072`. No cambia ninguna fila.
   5. **Push.** Desde ahí, un administrador de sede ya no guarda la tarjeta, el logo, el link de reseñas de la marca,
      el píxel ni el token (403 con el motivo): si alguno lo venía haciendo, ahora lo hace un super usuario. Con 0 o 1
      sede activa nada cambia.
0.ESCALA **ESCALA-3 (Zernio contesta antes de la IA) y ESCALA-4 (la analítica pagina): DESPLEGADAS el 2026-10-04 (y la
   analítica corregida con el hotfix `ff9fd90`: ver §1, Código)
   (`main` = `9a06670`, Vercel READY), sin migración.** Falta mirar con un pedido REAL (lo cubre la prueba de
   0.AUTOCHAT) que en los logs de Vercel `webhook/zernio` conteste enseguida y que detrás salgan las líneas `[Delivery]`. **Queda abierto:** (a) el hueco
   residual de ESCALA-3: si la plataforma mata la función durante el trabajo diferido no queda fila en
   `delivery_intake_failures` (cerrarlo es una cola con reintento: otra decisión); (b) si una marca llega a decenas de
   miles de visitas en 6 meses, la analítica pasa a agregar en SQL (requiere migración); (c) ninguna pantalla del panel
   lee el `error` de `useDashboardAnalytics()`: con un 500 las tarjetas muestran **0** y las gráficas quedan vacías, sin aviso (es lo que se vio el 04-10:
   un fallo de la analítica se ve como «0 clientes»; lo visible de verdad es el 500 y `[Analytics][FALLO]` en el log). Detalle: auditoría §8.

0.CICLO **El ciclo de recuperación. La FASE 1B (los envíos) está CONSTRUIDA (2026-10-13, `d685c68` + su cierre), sin
   pushear, con la migración 00071 escrita y SIN aplicar; el ciclo sigue apagado en todas las marcas.** El cron de
   reactivación decide marca por marca: apagada = el código de siempre; encendida = decide los toques y los encola a la
   hora de la marca; el drenador los envía, pone «vence el domingo» al enviar y otorga el regalo solo si salió.
   `?dry=1` lo simula sin escribir nada, también en una marca apagada. Detalle: `docs/features/campaigns.md` § «El ciclo
   encendido» y `send-governance.md` § «Los toques del ciclo en el drenador». **Lo del dueño, en este orden**
   (paso a paso con el SQL exacto y qué esperar: `SQL-PARA-CORRER/ciclo-fase-1b/LEEME.md`):
   1. **Aplicar la 00071 ANTES del push** (Supabase del PRODUCTO; tiene que decir `OK 00071`). Al revés, el recordatorio
      de premio deja de salir en todas las marcas (42703).
   2. **Push** (el hash, en el cierre de la sesión). Nada cambia para ninguna marca: todas siguen apagadas.
   3. **`demo-ventas` un día** (envío simulado): mirar qué plantillas tiene, encender, y al día siguiente las consultas
      del paso 2.c.
   4. **Don Alirio, dos semanas:** elegir su regalo pequeño y su fuerte (o ninguno: sale sin regalo) **en Recompensas › Premios para regalar** (desde el 13-10 hay pantalla; el LEEME de la 1B todavía lo explica por SQL), mirar si «Regalo
      que vence» está aprobada y el cupo de su línea, correr el `?dry=1` (con el `CRON_SECRET`, o pedírselo al
      comandante), encender y revisar al día siguiente. Apagar: paso 4 del LEEME (lo que estaba en cola ya no sale).
   5. **A las dos semanas:** retorno a 14 días por etapa con y sin mensaje, y la segunda visita (paso 5 del LEEME).
   Antes: **La FASE 1A (la base del motor) está HECHA (2026-10-11, `163c5a0` + su cierre),
   con la migración 00070 APLICADA por el dueño el 2026-10-12 («00070 corrida»; no trajo el resultado, `OK 00070`) y nada
   que envíe.** **PUSHEADA el 12-10** (§1, Código). **Las consultas 1 y 2 ya corrieron (12-10)** y salieron como se
   esperaba: no falta ninguna visita en ninguna marca (contador = filas; **el 2,4 % de Sushi Fun es real**, ver N-DOBLE
   en `docs/PENDIENTES.md` §5) y la foto del ciclo da Don Alirio → `cafe`, Sushi Service → `restaurant`, archivados,
   sin backfill y mensajes contados en 0. Resultados: `SQL-PARA-CORRER/ciclo-fase-1a/LEEME.md` § Resultados. **Prompt de la 1B
   listo** (12-10): `docs/prompts/2026-10-12-ciclo-fase-1b-envios.md` (Opus, una sesión, una migración); construida el 13-10
   (arriba). Lo que la 1A le dejó, resuelto punto por punto: `docs/PENDIENTES.md` §2.4. Lo construido en la 1A:
   `docs/features/ritmo-adaptativo.md` §7. Prompt de la 1A: `docs/prompts/2026-10-11-ciclo-fase-1a-motor-base.md`. El dueño
   decidió todo el bloque A el 11-10 con los datos de producción (spec §14; `docs/PENDIENTES.md` §8): **ritmo personal**
   (clientes con 3+ días de visita) y **ritmo de la marca calculado** para los nuevos; cuatro ritmos validados (cafetería
   7·14·26·42·58, casual 10·17·29·45·61, restaurante 14·28·42·60·80, ocasiones 21·38·56·80·110); **motor de piezas** para
   sumar cumpleaños del restaurante, eventos, rifas y activaciones sin rediseñar; canal por mensaje; **sin Wallet**;
   piloto en **Don Alirio**; métrica principal: **la segunda visita** (línea base ~22 %). Feature y ángulo de venta:
   `docs/features/ritmo-adaptativo.md`.
   Antes: DISEÑADO el 2026-10-04 (dos pasadas; la segunda aplica la revisión del dueño).
   Las FASES 0 y 0.bis están PUSHEADAS JUNTAS a `main` (`2746d49`, 2026-10-11, orden del dueño; sin migración; antes del
   push: tsc limpio, 65 archivos / 929 tests). La 0 sola reintentaría cada día, sin techo, a todo número que falle (la
   línea de Twilio de Sushi Service muere hacia el 12-10).** Fase 0 (N3, N4, N15): un envío fallido ya no calla al cliente (las dedups cuentan solo
   `sent`/`delivered`); el insistente sale UNA vez mientras el cliente no vuelva (`yaRecibioElInsistente()`); Campañas dice
   la hora real y «insistente al día M, una sola vez»; una sola escala (`deriveCycleBands()`). Fase 0.bis: cada toque admite
   **3 fallidos** (`MAX_INTENTOS_FALLIDOS_POR_TOQUE`; suave, insistente, cumpleaños y recordatorio; los viejos cuentan);
   `error_message` dice la causa real (`proveedor · código · mensaje`, de `message_logs`); `last_campaign_at` y el sello del
   recordatorio se escriben aunque la corrida aborte; el estimador da 500 en vez de «0»; Clientes y «Rescatar Perdidos»
   siguen los días de la marca. Detalle: `docs/features/campaigns.md` § «Tope de reintentos». Queda abierto:
   `docs/PENDIENTES.md` §5 (N3-quinquies; N3-quater y N7 cerrados en P1-a, 2026-10-11). **Línea base (SQL del 2026-10-10, antes del push):**
   sushi-service: **270 clientes recibieron el insistente repetido, 418 mensajes de más** (demo-ventas 370 / 582, simulados:
   `is_demo`); callados por un fallo: **230 en reactivación** (sushi-service 191, don-alirio 29, Planeta Wings 10) y **40
   en cumpleaños** (sushi-service 18, sushi-fun 14, don-alirio 7, Planeta Wings 1). **Del dueño:** mirar en Vercel por qué falló
   Planeta Wings el 5 y el 6 (`PENDIENTES.md` §6.1). Desde el deploy, `campaign_messages.error_message` ya dice la causa
   real de cada fallo nuevo. Un mes después, la misma
   consulta: las columnas 2 y 3 deberían quedar en cero o casi. Es el Bloque 7 (§16 de agosto, ola P5). Lo que el dueño pidió: *«dos
   comunicaciones en un mes y ya se acabó… una línea de tiempo de 90 días… calendario y campañas en el mismo lugar… más
   fácil y dopamínico»*. Diagnóstico contra el código (no contra `message_logs`): el «insistente» NO se apaga, se repite
   cada ~30 días sin tope y un fallo de envío calla 30 días.
   · **Spec:** `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md`: estados activo/dormido/archivado,
     cinco toques escalados por **una pregunta** (¿cada cuánto vuelve un cliente?: 4 ritmos), fatiga a las 6, toque
     trimestral (pequeño, luego fuerte: esquiva el cooldown), UNA plantilla nueva `gift_expiring` («Regalo que vence»)
     con el adaptador a la insistente como ruta por defecto, el toque espera al evento en su blackout, hora por marca
     (almuerzo/cena) vía `send_queue`, «vence este domingo», grupo de control `holdout` desde la fase 1, pantalla que
     abre con sugerencias para **aprobar** y seis cajas por etapa (nuevos / ya volvieron). El §12 lista qué cambió y las
     dos premisas de la revisión que el código contradice. · **Prototipo:** `…-mockup.html` al lado, y
     <https://claude.ai/artifact/EKRPox4mCdvsSwiGbETDB5>. · **Prompt fases 0 y 1:** `docs/prompts/2026-10-04-ciclo-fase-0-y-1.md`.
   **Tercera pasada (2026-10-08):** siete correcciones contra el código (spec §13): dos ritmos rompían el tope de 3 al mes,
   el recordatorio salía también para el regalo pequeño, el almuerzo no podía salir el mismo día (el cron corre a las 15:00
   Bogotá), el grupo de control era permanente y no medible, la cola dejaba toques colgados, y el deploy encendía las 25
   marcas a la vez. Ahora son **19 decisiones** (`docs/PENDIENTES.md` §8, bloque A).
   **Después de lo de la 1A (arriba):** mirar el prototipo cuando pueda (no frena la 1B); la 1B (envíos y
   piloto) y la fase 2 (pantalla) llevan prompt aparte del comandante.
0.CUMPLE **Cumpleaños: el código está DESPLEGADO (2026-10-04). Falta solo crear la plantilla nueva en cada marca.**
   Mientras una marca no tenga APROBADA «Cumpleaños — dos días antes» (`birthday_upcoming_template_sid`,
   `cumpleanos_se_acerca`), sigue con «¡Feliz cumpleaños!» el día mismo, como siempre. El día que Meta la
   aprueba, esa marca pasa SOLA a saludar hasta dos días antes, sin huecos y sin repetir
   (`docs/features/campaigns.md` § Cron Cumpleaños). Lo del dueño, por marca:
   · **Desde el 12-10 («un solo libro» desplegado, 0.PLANTILLAS), en TODAS las marcas, Twilio o Zernio:** Plantillas →
     Mensajes automáticos → **«Enviar los N juntos a Meta»**, que la manda con las tres nuevas (un solo viaje).
   · **Tepuy:** nada. Sin WABA todavía; el AIOS v1.14.0 ya crea la nueva en el alta.

0.DOMI **Planeta Wings ve «Los domicilios por WhatsApp no están activados en tu marca»: el botón ya está
   desplegado (AIOS v1.12.0, 00066 aplicada, 12).** Queda el gesto del dueño: en el AIOS, Planeta Wings → sede →
   tarjeta Sistema → «Domicilios por WhatsApp» → **Encender**, cuando la línea ya reciba y el celular del
   operador esté en Domicilios → Autorizados de su panel. La bandera solo informa: ningún webhook la lee.
   Aparte: **el Supabase del AIOS devuelve `Gateway Timeout`** en `generate_due_payments` y en las lecturas de
   `/clientes/[id]` (logs de Vercel: 14:10, 15:00, 15:30 UTC del 12; empezó el 11 a las 23:45). Calza con el
   incidente de Supabase «Nano projects unresponsive» del 10-11 (resuelto). Es del dueño: Settings → General →
   **Restart project**; si sigue lento, subir de Nano a Micro.
0.AUTOCHAT **DESPLEGADO y CONECTADO el 2026-09-25 (`8be572e`, deploy READY; 00068 aplicada; `message.sent` suscrito).
   Falta la PRUEBA REAL: que José mande un pedido al auto-chat y se vea el resultado.**
   Planeta Wings usa UN número para todo: el mesero escribe el pedido en el chat de la línea consigo misma y
   Meta no lo entrega como entrante, así que se perdía entero. Ahora el webhook atiende `message.sent`.
   (1) ~~Aplicar la 00068~~ — hecho por el dueño el 25.
   (2) ~~Suscribir `message.sent`~~ — hecho el 25 con `node scripts/zernio-webhook-eventos.mjs --aplicar`.
   El webhook `6a9e57fb44ed40ab69223879` (`hooks.constelarys.com/api/webhook/zernio`, dominio verificado de
   `cada1`) pasó de 16 a 17 eventos, verificado releyendo. **NO estaba suscrito**: era el segundo motivo por el
   que no entraba nada, aparte del auto-chat.
   (3) **LA PRUEBA REAL, que es lo único que queda.** El opt-in del auto-chat ya está puesto: el número de la
   MARCA (300 903 3799) está en Autorizados, y ése es justo el que la rama nueva exige. Así que **José escribe
   un pedido en el auto-chat y tiene que pasar esto**: el cliente recibe la plantilla de bienvenida, aparece
   «enviado» en el panel, y en los logs de Vercel sale `[webhook/zernio] pedido en el auto-chat de …`.
   Si en cambio sale `message.sent sin auto-chat conocido conversationId=…`, la conversación sembrada en la
   00068 era la equivocada: se pone ese `conversationId` en `tenant_connections.self_conversation_id` y listo.
   (4) **Aparte, y solo si José va a usar SU celular**: agregar 311 672 9678 en Domicilios → Autorizados con su
   sede. No hace falta para el auto-chat; hace falta para que pueda mandar pedidos desde su propio teléfono.
   ⚠️ **Sin verificar: si la `ZERNIO_API_KEY` de Vercel sigue viva.** La de `.env.local` estaba muerta (401) y se
   reemplazó por una nueva; la de producción es otra variable (`sensitive`, del 11-09) que no se puede leer. Si
   las plantillas de las marcas en Zernio vienen saliendo bien, está viva y no hay nada que hacer.

0.SUSHI **Sushi Service: la difusión por la línea de coexistencia (Zernio), lo normal por Twilio
   hasta que muera (dueño, 2026-09-12).** El operador desactivó la SIM de Twilio; el WhatsApp sigue
   vivo (~1 mes) y manda bien, pero a la difusión la toman por número falso. **Construido y pusheado el 12
   (`712ff58`, `origin/main` = `05b7eb8`):** el Golden Bullet lee `admin_settings.golden_bullet_provider` y con `zernio` + cuenta
   conectada lista/crea/prueba/manda por Zernio **aunque la marca siga en `twilio`**
   (`goldenBulletProviderFor()`, `options.provider` en `sendTemplateMessage`, `?provider=golden_bullet`
   en `/api/dashboard/templates`), y el webhook de Zernio **contesta el «sí»/«no»** con texto libre
   en la ventana de 24 h (`sendZernioConversationMessage()`, contrato §8, verificado contra el
   OpenAPI público). Botón en Golden Bullet → Plantilla. Paso a paso: **`docs/RUNBOOK-SUSHI-SERVICE-A-ZERNIO.md`
   §A** (modo puente doble) y §1-§9 (migración completa, para cuando Twilio muera). Lo que el
   dueño tiene que hacer, en orden: (1) **verificación del negocio en Meta**, HOY — la línea de
   coexistencia nace en 250 únicos/día y los 1.000 solo llegan verificada; (2) el alta en el AIOS
   (§3 del runbook) + **la 00067 ya corrió (dueño, 29) — ⚠️ con el REVOKE incompleto: lo cierra la 00069, 0.SEGURIDAD punto 1** y el botón «4-bis. Zernio en paralelo» de la sede en el
   AIOS v1.13.0 (`aios_attach_zernio_account`: los `zernio_*` sin tocar el proveedor; §A.3, con el
   `UPDATE` como respaldo); (3) `ZERNIO_API_KEY`
   y `ZERNIO_WEBHOOK_SECRET` en el Vercel del PRODUCTO y desplegar; (4) el botón, la plantilla,
   24-48 h de Meta, prueba a su celular, tanda de ≤250/día hasta que Meta suba el cupo. Pendiente
   de código: `tier_unlocked_template_sid` y `reward_reminder_template_sid` fuera del catálogo
   del AIOS (§5 del runbook) — solo pesa en la migración completa.
0.AIOS **Tepuy: WhatsApp CONECTADO (2026-10-13), todavía NO puede escribir primero.** Zernio cambió el número en el
   mismo registro por **+57 604 201 1012** (verificado en Meta el 12-10, vence 10-01-2027). El link del AIOS (v1.15.1, ya en
   su `main`) salió bien a la primera (el comandante lo decodificó: perfil, número e id correctos, revisión encendida) y la
   dueña conectó: WABA `2315429052538548`, cupo `TIER_2K`. **Faltan tres cosas de la dueña** (instrucciones ya enviadas):
   1. **Método de pago** en su WhatsApp Manager: sin él, ningún mensaje que inicie la marca sale (bienvenida, puntos,
      campañas); las respuestas dentro de las 24 h sí. Quién paga a Meta (ella directo o Cada1) es decisión del dueño.
   2. **El nombre visible quedó «Yenifer Yohana Calle Morera»** (Meta lo llenó con el nombre del portafolio y lo aprobó al
      instante): cambiarlo a «Tepuy» en WhatsApp Manager ANTES del primer mensaje (revisión 1-3 días; puede pedir pruebas).
   3. **Verificación del negocio** (RUT o Cámara de Comercio).
   Después: Plantillas → «Enviar los N juntos a Meta» en su panel. La `ZERNIO_API_KEY` del `.env.local` del AIOS está
   muerta (401); la del producto funciona.
   **Para que no se repita: AIOS v1.15.2 CONSTRUIDA (2026-10-13, `4b88ab5` del AIOS), SIN pushear** (tsc · lint · build
   limpios; push del dueño, Vercel `cada1_aios` lo despliega solo; sin migración ni variables nuevas). La página del link
   pide «Nombre visible: {marca}, no tu nombre» y va en tú; el paso 3, ya conectado, lee en vivo `GET
   /v1/whatsapp/number-info` y dice si puede escribir primero y qué le falta al dueño (pago, verificación, nombre).
   **Al desplegar, abrir el paso 3 de Tepuy**: tiene que decir «Todavía no puede escribirle primero a nadie» con esas tres
   tareas (es la única verificación que falta: la lectura no se probó contra la cuenta real). El spec 1.274.0 **no deja
   pre-llenar** el Embedded Signup: el mensaje para el soporte de Zernio, listo para copiar, está en
   `Level 2.0/aios-constelarys/docs/features/whatsapp-connect-link.md` § Pendiente. Ahí también: `/conexion/whatsapp` (la
   página de retorno) sigue en vos.
   ⚠️ `clubtepuy.constelarys.com` (raíz) con DOS sedes activas **no debe llevar a Envigado**: por D21
   responde 409 con la lista de sedes. Si lleva a Envigado, o Laureles está inactiva en el producto, o
   Envigado tiene el dominio raíz como propio. Se mira en `/dashboard/sedes` de Tepuy.
0.PLANTILLAS **Plantillas: un solo libro y una sola pantalla — CONSTRUIDO el 2026-10-11, sin migración, DESPLEGADO el 2026-10-12**
   (`a37fdec`, `9c03807`, `4930097`; `docs/features/whatsapp-templates.md`). El panel reconoce lo que ya está en la WABA
   (en revisión, rechazado con motivo, el puntero del AIOS con su texto real) y un 400 «ya existe» adopta; «Nivel
   desbloqueado», «Recordatorio de premio» y «Regalo que vence» entraron JUNTAS al catálogo (16); Plantillas es UNA
   pantalla para Twilio y Zernio (pestañas Mensajes automáticos y Biblioteca para campañas) y Ajustes › Plantillas ya no
   asigna punteros (queda una tarjeta que lleva a Plantillas); las marcas Zernio crean libres; las rutas Twilio exigen
   alcance de marca. **Lo del dueño, en orden:**
   1. ~~Desplegar~~ — pusheado el 12-10 con la 1A y PL-2-a (§1, Código).
   2. **Por marca, un solo viaje a Meta — solo DESPUÉS de desplegar:** Plantillas → Mensajes automáticos → leer los tres
      textos nuevos y «Cumpleaños — dos días antes» y apretar **«Enviar los N juntos a Meta»**. Vale para Planeta Wings
      (Zernio) y para Sushi Service, Sushi Fun, Don Alirio, Frangal y demo-ventas (Twilio). Tepuy, cuando tenga número.
      Meta tarda 24-72 h. En **Zernio** cada mensaje se activa solo al aprobarse. En **Twilio NO**: el puntero se escribe
      al CREAR (`fillEmptyPointer()`, PL-2); desde PL-2-a (12-10) el recordatorio de premio y «Nivel desbloqueado» del
      check-in le preguntan a Twilio si ya está aprobada: durante la revisión no se intenta (el recordatorio no gasta
      intentos; el check-in cae a «puntos sumados»). Siguen sin preguntar el check-in manual del panel y el registro de un
      domicilio (un mensaje de nivel perdido, sin tope): `docs/PENDIENTES.md` PL-2. Los textos completos están en
      `docs/PLANTILLAS.md` § Las tres del 2026-10-11.
   3. **Planeta Wings:** con solo abrir Plantillas, lo que el AIOS dejó en su WABA queda registrado (un aviso verde lo
      lista). Las aprobadas que nadie activó siguen pidiendo «Activar»: activarlas es decisión del dueño.
   Queda para otras sesiones: B7 (el AIOS deja de crear plantillas; su copia NO tiene las tres nuevas) y B1 (menos
   aprobaciones por marca); lo chico en `docs/PENDIENTES.md` §3.2 (avisos que todavía dicen «en Ajustes», el puntero
   Twilio que se escribe al crear, reemplazar una Twilio rechazada).
0.GB **Golden Bullet por bloques y sondeo de salud: construidos el 10, faltan CUATRO cosas del dueño.**
   El código está en la rama (`640ae1f`). En este orden:
   0. **Encender el flag desde la pantalla** (botón «Encender Golden Bullet», 2026-09-11). Sin eso
      todo responde 403: era la causa de «el CSV no carga». El CSV que sube es `telefono,nombre`;
      los dos de Sushi Service ya están listos en `Contactos/salida/GOLDEN-BULLET-*.csv` (7.438
      recientes + 6.688 antiguos; a US$0,0175 son ≈US$247 y Twilio tiene US$18,90: **recargar antes**).
   1. ✅ **La `00060` ya está aplicada** (dueño, 2026-09-10, antes del push).
   2. **Escribir los tres textos y crear la plantilla. Meta tarda 24-48 h**, así que es lo
      primero del día. `/dashboard/imported-contacts` → «Plantilla»: el mensaje 1 entero con
      sus botones (desde el 11 se escribe ahí, `{{1}}` obligatoria y `{{2}}` opcional), la
      respuesta al «sí» con `{nombre}`/`{enlace}` y la **foto del regalo**, y la del «no». El mensaje 1
      admite **foto arriba** (se sube ahí; la plantilla sale como `whatsapp/card`). Arriba del paso 1 de
      «Nueva campaña» se puede **mandar el mensaje 1 a un celular tipeado** antes de programar nada.
      Antes del «sí»: crear la invitación con premio en Recompensas → Invitaciones y marcar
      «Usar en Golden Bullet» — sin eso, quien se registra **no recibe regalo** (la pantalla lo
      avisa en ámbar). El texto tiene que decir de dónde salió el número, **y ser verdad**.
   3. **Correr el sondeo en modo ensayo ANTES de dejarlo suelto**:
      `GET /api/cron/line-health?dry=1` con el `CRON_SECRET`. Devuelve el escalón y la
      calidad que ESCRIBIRÍA en cada marca, sin escribir. Es la primera vez que algo va a
      poner un número en `messaging_daily_limit`, y ese número es el freno de las campañas
      de marcas en producción: vale la pena mirarlo una vez. **Ese dry-run es además la
      respuesta a "¿de verdad tenemos el límite?"**, la pregunta del dueño del 10.
   4. **Decidir de qué marca es la base de 25.000 y con qué escalón.** El punto 3 lo
      contesta solo. La aritmética que hay que ver antes de prometer nada: a 250 son
      **139 días**; a 1.000, 27; a 10.000, 3. Golden Bullet dejó de ser una bala.
   ⚠️ **Si la base es comprada o de origen desconocido**, la línea de procedencia de la
   plantilla no puede decir «porque nos visitaste». Por eso la plantilla PREGUNTA en vez de
   promocionar: convierte una base sin consentimiento en una lista de gente que sí lo dio.
0.ALFA **ANTES de habilitar la sede 2 de cualquier marca — auditoría adversarial 2026-09-09.**
   Lo que sigue está confirmado leyendo el código, no supuesto. En orden de ejecución:
   1. **En el AIOS, marcar el cliente como «grupo» ANTES de dar de alta las sedes 2..N.**
      Si no, el paso 2 del wizard sigue ofreciendo crear un tenant por sede y salen N MARCAS,
      no N sedes. Es lo que le pasó a Tepuy. (`brands.ts:119` — `attachableBrands` devuelve `[]`
      si el modelo no es `group`.)
   2. **Darle subdominio propio a CADA sede, incluida la primera.** `aios_add_location` rechaza
      la sede 2 con `sede_previa_sin_subdominio` si la sede 1 vive del dominio raíz (00056).
      Elegir para la MARCA un host raíz distinto del de toda sede.
   3. **Asignarle sede a cada mesero — o marcarlo «Rota entre sedes».** Todos los vivos tienen
      `location_id` NULL y `/api/staff/waiters` filtra por sede: con 2+ sedes, **los escáneres
      salen vacíos**. Sigue siendo una DECISIÓN, persona por persona — pero ya no cuesta doce
      formularios: `/dashboard/staff` → «Asignar sede a varios a la vez» (casilla, sede **o
      «Rota entre sedes»**, aplicar; la `00062` ya está aplicada — dueño, 11: «la mayoría son
      rotativos»). Para varias marcas de una sentada, `SQL-PARA-CORRER/meseros-sin-sede/`.
   4. **`authorized_numbers.location_id` por cada sede.** Ya se escribe desde el panel
      (`/dashboard/authorized-numbers`, columna «Sede»); lo que YA existe sigue en NULL y hay que
      asignarlo: esa pantalla o `SQL-PARA-CORRER/authorized-numbers-sin-sede/`. ⚠️ Un celular
      existe UNA vez por marca (`authorized_numbers_phone_tenant_key`): si las 12 comparten de
      verdad el mismo celular de operador **no hay sede correcta**, se queda en «sede desconocida»
      y la salida buena es un celular por sede.
   5. **Confirmar el cupo real de la línea con Meta/Zernio** y ponerlo en
      `tenants.messaging_daily_limit`. Las N sedes comparten UN cupo de destinatarios únicos por
      24 h y el sistema falla CERRADO (00037). Ojo con los dos estados: las 5 marcas vivas están
      en **NULL** (miden, no frenan) y toda marca **nueva** nace en **250**, que con 12 sedes se
      agota a media mañana. El consumo ya se ve en `/dashboard/campaigns` (avisa al 75 %); el
      `UPDATE` con su advertencia está en `docs/RUNBOOK-DEPLOY.md` §8.c.
0.BETA **Lo que la auditoría dejó SIN JUZGAR** (34 de 95 agentes murieron por el límite de gasto
   de la cuenta, incluida la síntesis). Se corrigieron ya: el selector fantasma, el 409 sin
   pantalla, el 409 falso del PATCH de niveles, las filas heredadas editables y las dos guardas
   del POST de accesos, y el 09 **el agujero de permisos de `/api/dashboard/reward-tiers`**
   (era el más caro): sus escrituras exigen alcance de MARCA. **Queda SIN verificar** la coordenada
   con decimales en «Mis sedes». `/api/mystery-box/resolve` se verificó el 28 (cruzaba marcas) y se
   cerró en código el 03-10 → 0.SEGURIDAD.
0.GAMMA **Recompensas por sede: ya se pueden usar — la `00059` corrió (dueño, 29).** Los dos
   agujeros están cerrados en el código (09): el «ya reclamé» dejó de llevarse por `tier_id`
   —copiarle los niveles a una sede ya NO le gana un premio a nadie— y `current_tier` pasa a ser
   **el nivel de la MARCA** (se elige la salida «b»; el porqué en `points-mystery-box.md`
   §7.1.bis). `/api/mystery-box/resolve` ya tiene la guarda de «ya reclamé»
   (ola 0, 03-10, sin desplegar): solo otorga lo que `check-in/status` ofrece, con la misma
   función (`points-mystery-box.md` §7.4.ter). No se tocó
   `mystery_box_global_caps`, que sigue por `tier_id`: con premios propios el cupo global de
   premios altos pasaría a ser **por sede** sin que nadie lo haya decidido.
0.DELTA **Un administrador de sede abre un panel VACÍO.** `role='location'` nunca ve el cubo
   NULL (`location-scope.ts`, fila 4 del §5.1) y todo el histórico anterior a multi-sede es NULL.
   **(b) ya está hecha** (09): «Accesos» avisa, al elegir «Administrador de sede», que esa
   persona verá su sede **desde hoy** y no el histórico. **Falta la decisión del dueño sobre
   (a)**: darle además el cubo NULL de las sedes que tiene asignadas mientras el histórico no
   esté atribuido. (a) toca `decideLocationScope()` y por lo tanto **los dos espejos** —el TS y
   `can_see_location()` de la 00045, que `tests/db/multisede-permisos.test.ts` vigila—, así que
   no se hace por cuenta propia. El histórico NO se backfillea en ninguno de los dos casos.
0.ZETA **`rewards` y `campaign_rewards` recibieron `location_id` pero NADIE lo lee.** «Las
   recompensas varían por sede» hoy es cierto **solo** para `reward_tiers`. Los premios por
   visitas y los de campaña siguen siendo de la marca.
0.ETA **La importación de clientes por CSV cuenta como importados los que la base rechazó**
   (`dashboard/customers/page.tsx:156-161`: no mira `res.ok`). Con 2+ sedes el registro responde
   409 y la importación reportaría éxito sobre cero filas.
0.THETA **El requisito «un celular por sede» NO está construido** y hay que decirlo antes de
   firmar. La línea se elige leyendo solo columnas de `tenants`; un subdominio de sede resuelve a
   la MISMA fila. Lo que sí hay por sede: enlace `wa.me`, teléfono de domicilios y ficha propia.
0.IOTA **WhatsApp nunca se estrenó de verdad, y los dos restaurantes nuevos estrenan caminos
   DISTINTOS.** `docs/features/zernio-messaging.md` lo dice con todas las letras: *"no se ha
   enviado un mensaje de verdad a un número controlado por el equipo con un tenant
   `messaging_provider='zernio'` en producción"*. Ojo con la confusión de base: **coexistencia
   NO es lo mismo que Zernio**. Coexistencia es `whatsapp_provisioning.route='own_number'`
   (trae su número: `onboarding='business_app'`, `isCoexistence=true`, no cotiza ni compra);
   Zernio es `tenants.messaging_provider`. Sushi Fun es coexistente **por Twilio**, absorbido
   por SQL, no por el wizard — así que no prueba nada del camino nuevo.
   En orden, antes de mandarle un mensaje a un cliente real:
   1. **`ZERNIO_WEBHOOK_SECRET` en Vercel.** Sin él el webhook rechaza TODO (es a propósito:
      exige firma siempre, aunque Zernio la trate como opcional). No está en `.env.local`.
   2. **Confirmar el NOMBRE del header de la firma.** `webhook/zernio/route.ts:580` acepta
      `x-zernio-signature` **o** `x-late-signature` porque nadie confirmó cuál manda Zernio.
      Si no es ninguno de los dos: 401 a todo entrante, no llega ningún cuadro de pedido y
      **parece un problema de permisos**. Se confirma con UN mensaje entrante real.
   3. **Decidir la cuenta/Team de Zernio** (la compartida con otro proyecto o una dedicada).
      El saldo se factura por Team completo y no hay endpoint de saldo por tenant.
   4. **Probar el envío con `scripts/zernio-sandbox-test.mjs --to <tu propio celular>`.**
      ⚠️ El número de sandbox (`+12029087457`) es COMPARTIDO entre todos los desarrolladores
      que prueban Zernio: nunca a un cliente, nunca a un número ajeno.
   5. **Los dos nacen con `messaging_daily_limit = 250`** (DEFAULT de la 00037). Es el punto 5
      del 0.ALFA y aplica igual con una sola sede.
   6. **Plantillas de evento: el dueño las está creando A MANO en Twilio (Sushi Fun, Sushi
      Service, Don Alirio) y ya hubo dos rechazos, los dos leídos con
      `scripts/verificar-plantillas-evento.mjs` (solo lectura, `.env.twilio` / `.env.sushifun`):
      `image_campanas_calendario` → «Error downloading invalid media URL» (`Zernio_template.jpg`
      NO está en la raíz del bucket; usar `5103017800669793459.jpg` y `0906.mp4`, que responden
      200) · `image_campaing` → `INVALID_FORMAT`: el marco tenía 8 palabras para 5 variables y
      Meta exige 3×N+1. **El cuerpo corregido (22 palabras) está en `docs/PLANTILLAS.md`
      § Plantilla 12 y en `SQL-PARA-CORRER/plantillas-evento-viejas/LEEME.md`**, con los ejemplos
      y la Media URL con `{{6}}`. Una plantilla rechazada NO se reintenta en Twilio: se crea otra
      con nombre nuevo. Al aprobar: pegar el `HX…` en `admin_settings.event_template_*_sid` del
      tenant. Zernio (AIOS v1.10.x, Pedacito/Tepuy): «Crear plantillas» cuando tengan el paso 3 y
      las dos `ZERNIO_TEMPLATE_SAMPLE_*_URL` en el Vercel **del AIOS**. Producto y AIOS con el
      cuerpo corregido: **sin pushear** (`675fdbe` en el AIOS).
0.quinquies **Supabase del AIOS: la `00010` está aplicada (03-10: su `aios_register_whatsapp_connection` apareció
   en el catálogo); la `00009`, sin confirmar.** Sin la 00009, guardar un cliente «grupo» o «franquicia» revienta con
   el CHECK viejo. Se confirma guardando uno, o en el SQL Editor **del AIOS** con `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'clients'::regclass AND contype = 'c';` (tiene que nombrar `franchise`).
0.quater **Falta el autoservicio de contraseña** («olvidé mi contraseña» en `/login`). Ya se puede
   cambiar una clave desde «Accesos» y desde el AIOS, así que nadie queda encerrado — pero mientras
   no exista el autoservicio, cada olvido sigue pasando por una persona. Depende de que el SMTP del
   proyecto de Supabase esté configurado, que **no está comprobado**: comprobarlo es el primer paso.
0. **`AIOS_ADMIN_PROVISION_SECRET` en los DOS Vercel**, la MISMA cadena — el dueño la estaba cargando el 08,
   con el código ya desplegado. Sin ella el producto responde **503** y la tarjeta «Usuario del panel» se ve
   pero dice que está apagada. Comprobarla dando de alta a **Pedacito de Amor**, que espera su usuario;
   si algo falla, el SQL de `docs/features/alta-usuario-admin.md` §7 hace lo mismo a mano.
0.bis **Tepuy nació como DOS marcas** (`clubtepuylaureles` 01:48 y `clubtepuyenvigado` 01:53): el alta salió con
   el AIOS **v1.5.2**, que creaba un tenant por sede; la v1.6.0 quedó desplegada a las ~01:59. **Decisión del
   dueño (08): se borran las dos y se rehace como UNA marca con dos sedes, compartiendo un solo número.**
   Los QR ya están impresos, así que los dos subdominios se reusan TAL CUAL, ahora como dominio de cada SEDE,
   y la marca estrena `clubtepuy.constelarys.com` (el raíz manda aunque una sede lo repita: sería el 409).
   Paso a paso en `SQL-PARA-CORRER/tepuy-una-marca/LEEME.md` (el 02 va en el Supabase del **AIOS**).
   **Corre prisa**: los dos subdominios responden, y el primer check-in convierte esto en otro problema.
   La clienta pidió **un celular por sede**: eso es **F9** (`location_messaging`, cupo y plantillas por línea)
   y choca con **D6**; por ahora comparten línea. Sin decidir.
1.bis **Pusheado `c96bce5` a `main` el 08 (noche).** Falta la mirada del dueño: abrir `/dashboard/marca` (ahora "Tarjeta principal"), cargar redes/sellos de una marca y abrir
   su `/tarjeta` en un celular. Sin config nueva, ninguna marca cambia.
2. **Smoke test** del `docs/RUNBOOK-DEPLOY.md` §5 con Sushi Service real, apenas terminen las cinco:
   crear un evento con enlace, abrir Conexiones, y mirar la tarjeta en un celular.
3. **Asignarle sede a los meseros que ya existen, o marcarlos rotativos.** Todos tienen `location_id` NULL, así
   que **no aparecen en ningún escáner**. Falta solo la DECISIÓN, persona por persona: la herramienta ya está en
   `/dashboard/staff` («Asignar sede a varios a la vez», con la opción «Rota entre sedes» desde la `00062`) y en
   `SQL-PARA-CORRER/meseros-sin-sede/`.
4. **Zernio E2E** con la cuenta ya limpia → desbloquea al primer cliente nuevo bajo coexistencia. ⚠️ **Se intentó
   el 08 y no se puede desde esta máquina**: la `ZERNIO_API_KEY` de `.env.local` responde **401** a todo GET
   (`/v1/profiles`, `/v1/phone-numbers`, `/v1/api-keys`), `.env.local` no tiene credenciales de Supabase, y no
   hay un teléfono propio al que mandar. Hace falta: la key vigente (la de Vercel), el `accountId` de la marca
   Zernio y un número del dueño para `scripts/zernio-sandbox-test.mjs --account … --to …`. Con él va
   **`ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL`** = `…/event-media/5103017800669793459.jpg` en Vercel (la muestra
   que Meta YA aprobó; el HEIC del bucket **no sirve**). Sin ella las 2 de calendario salen bloqueadas.
5. **`owner_email` está vacío en las 5 marcas**: Conexiones **solo la opera el super-admin** (`isTenantOwner()`
   es fail-closed y la pantalla lo dice). Una llamada por cada alta hasta que el AIOS lo mande.
6. **Subdominio sin tenant muestra Sushi Service** (comprobado el 07 con `pedacitodeamorclub.constelarys.com`):
   `getBrandingForHost()` cae a `DEFAULT_BRANDING` (`NEXT_PUBLIC_BRAND_*`). Sin fuga de datos, pero un cliente
   que abre su enlace antes del alta ve otra marca. **Qué mostrar (404, página neutra) es decisión del dueño.**
7. **De §18 quedan DOS** (`docs/DECISION-18-DOMICILIOS-COEXISTENCIA.md`): **18.e** (a los clientes de Sushi Fun
   se les contesta que ese número «es exclusivo para mensajes automáticos») y **18.c** (plantilla de fallo de Zernio).
8. **De `docs/AUDITORIA-POST-DEPLOY-2026-09-06.md`** queda vivo el AMARILLO de `reward-reminder` (Crons). El
   ROJO 3 está entero en `main` y vive solo hasta que corra la 00053. Sigue stale `docs/04-deployment.md`.
   (`docs/ESTADO-REQUERIMIENTOS.md` quedó reemplazado el 04-10; la **18.e** ya está hecha: el punto 7 se puede cerrar.)
9. **Aplicar la 00030** en ventana tranquila (cierra el riesgo del DEFAULT puente). **Confirmado el 11-10: NO corrió**
   (18 tablas con el DEFAULT). Antes de aplicarla, una sesión tiene que barrer los INSERT sin `tenant_id`: con la 00030
   puesta, un INSERT así deja de irse callado a Sushi Service y pasa a fallar en producción.
10. **Onboarding de los 25**: wildcard DNS ya resuelto y probado con Sushi Fun.

**El norte** (dueño, 2026-09-05, corregido el 09-11): **Meta ya está entera** — píxel + API de Conversiones, y
**cada marca conecta la suya** desde el panel (`docs/features/meta-pixel.md`). **El píxel de Cada1 queda APAGADO
por decisión** (09-11): cruzar la base de una marca para la campaña de otra viola finalidad y responsable de la
Ley 1581, así que un buzón con las 25 juntas no aporta nada que valga ese riesgo. **NO se desarrollan todavía**:
automatizaciones dentro del restaurante y **Google** para reseñas.

## 4. Bloqueado: solo lo puede destrabar el dueño

- **Ver la API de Conversiones funcionar UNA vez** con el píxel de un restaurante real y el código de «Probar
  eventos» de SU Administrador de eventos: es la única verificación que esta feature no tuvo
  (`docs/features/meta-pixel.md` § Cómo se verifica). `NEXT_PUBLIC_META_PIXEL_ID` y
  `META_CONVERSIONS_ACCESS_TOKEN` **se quedan vacías**: el píxel de Cada1 está apagado por decisión (§3, el norte).
- **Decidir qué pasa con los clientes que ya existían.** La casilla nueva (celular cifrado a Meta) la aceptan
  los que se registran desde hoy; los anteriores aceptaron WhatsApp y nada más, y sus check-ins **sí** se mandan
  con el celular hasheado. Separarlos cuesta guardar la versión del consentimiento por cliente y filtrar en
  `scheduleMetaConversion()`. Es una decisión, no un bug.
- **Borrar el worktree viejo `.kilo/worktrees/ivy-city`** (del 25-09, de la herramienta Kilo): limpio, su commit `311bbe9`
  ya está en la rama y no tiene `node_modules` enlazado, así que borrarlo no toca el de la raíz. Viola la regla de
  worktrees y **duplica el lint** (los 14 errores son 7 de `src/` más su copia). `git worktree remove .kilo/worktrees/ivy-city`.
- **Borrar las ramas locales ya mergeadas** (`feat/salud-aios`, `feat/domicilios`, `feat/conexiones`, `feat/visual`,
  `preview/capa-visual`) y el **stash** olvidado de `fix/opt-out-visible` (`git stash show -p stash@{0}` para mirarlo).
- **Borrar el Supabase de Sushi Fun.** Esperar a un fin de semana de operación normal. El respaldo son los
  `SQL-PARA-CORRER/sushi-fun/*.sql` (1.421 filas), que **NO cubren** Auth, RLS ni storage. El Vercel viejo queda **pausado**.
- **Todas las preguntas abiertas** (campañas, plantillas, recompensas, operación), con su valor por defecto: `docs/PENDIENTES.md` §8.
- **Separación de una sede** (venta, franquicia, socio distinto) — aplazada por el dueño, 2026-09-02.
- Decisiones ya CERRADAS que no se reabren: **D6** (N líneas por marca, la sede no obliga a ninguna; `multi-sede.md` §5) ·
  **D21** (un subdominio por sede, todas pares; con 2+ sedes el dominio RAÍZ deja de registrar, 409; `multi-sede.md` §3.5).

## 5. Hecho reciente

- **Push del 14-10 (comandante)**: S-1, SEG-2/SEG-3 (00072 **aplicada**; la consulta de duplicados dio 0 filas) y AIOS
  v1.15.2, verificados contra el código (tsc, 86 archivos / 1.373 tests, la función del AIOS con los datos reales de Tepuy).
  Antes, el 13-10: 1B pusheada con la 00071 aplicada. Prompt de la fase 2: `docs/prompts/2026-10-14-ciclo-fase-2-pantalla.md`.
- **SEG-2 y SEG-3** (2026-10-13, `526f4a0` + `87ebac9`, migración **00072 sin aplicar**, sin pushear): la carrera de dos
  `resolve` simultáneos la cierra la BASE (trigger AFTER INSERT con `pg_advisory_xact_lock` por cliente, espejo SQL de
  `elegirNivelSinReclamar()` probado caso por caso; `NivelYaReclamadoError` → 409 antes de otorgar y del WhatsApp;
  trigger y no UNIQUE porque la historia puede tener duplicados y no se toca). La config de la marca —`tenant-config`,
  `brand-logo` y el token de `meta-conversions`— exige alcance de marca; las pantallas lo dicen en español y mandan a
  Sedes para lo de la sede. → `CHANGELOG.md`, `points-mystery-box.md` §7.4.ter, `multi-sede.md` §3.septies,
  auditoría §9, `SQL-PARA-CORRER/seg-2-carrera-resolve/`.
- **Recompensas en un solo lugar (S-1)** (2026-10-13, `a367beb`, **sin migración, sin pushear**): Recompensas gana la cuarta
  pestaña «Premios para regalar» con el catálogo (sale de Campañas, A7) y, arriba, «Para qué se usa cada premio» (sale de
  Ajustes, C1): regalo fuerte (`aggressive_reward_id`, también el del rescate del ciclo), regalo pequeño
  (`cycle_small_reward_ids`) y premio por reseña, con lo que dura cada uno (C2) y un aviso si el premio elegido ya no está
  activo. Las invitaciones eligen del catálogo llenando el título (C3, **sin migración**). Las escrituras del catálogo
  exigen alcance de marca (un administrador de sede cambiaba el catálogo de TODA la marca) y su lectura da 500 si la base
  falla. Los enlaces viejos redirigen. El recordatorio de vencimiento se mudó con el regalo fuerte (decisión tomada sin
  preguntar). → `CHANGELOG.md`, `reward-grants.md` § «Dónde vive cada premio», `PENDIENTES.md` §4.1.
- **Ciclo, fase 1B: los envíos** (2026-10-13, `d685c68`, migración **00071 sin aplicar**, sin pushear, el ciclo apagado en
  todas las marcas): el cron decide y encola por marca (apagada = lo de siempre), con nada atrasado al encender, la
  despedida pasada que duerme sin mensaje, blackout, grupo de control, cap de 7 y tope del mes con su fecha, trimestral y
  archivado, y el adaptador «Regalo que vence» / insistente; el drenador guarda, fecha al enviar, regalo solo si salió (el
  pequeño sin recordatorio, H2); el toque sigue a la cola por un trigger (H6); N-MES, TEST-deadlock y el día real del
  recordatorio (sábado: los cuatro ritmos pasan). Tests del cron y del drenador REALES sobre Postgres
  (`tests/setup/supabase-sobre-pg.ts`). → `CHANGELOG.md`, `campaigns.md`, `send-governance.md`, LEEME de la 1B.
- **Push de la 1A + plantillas + PL-2-a, y las consultas de la 1A** (2026-10-12, orden del dueño): ver §1, Código. La
  consulta 1 descartó que a Sushi Fun le falten visitas (contador = filas en las 8 marcas): su 2,4 % es real, y 10 de sus
  16 «volvieron» son dos escaneos el mismo día (N-DOBLE). La consulta 2 salió como se esperaba. → `CHANGELOG.md`,
  `SQL-PARA-CORRER/ciclo-fase-1a/LEEME.md` § Resultados.
- **PL-2-a: una plantilla Twilio sin aprobar ya no se usa** (2026-10-12, sin migración, desplegada el mismo día): el cron
  `reward-reminder` le pregunta a Twilio si el recordatorio está aprobado (una vez por corrida, solo con premios por
  avisar); si no, ese día no se intenta ni se graba nada, y la revisión de Meta ya no gasta los 3 intentos del premio. El
  check-in hace lo mismo con «Nivel desbloqueado», solo al cruzar de nivel: sin aprobar, cae a «puntos sumados». Zernio y
  la marca demo no preguntan. Quedan 2 emisores sin la pregunta (PL-2). → `CHANGELOG.md`, `whatsapp-templates.md`.
- **Plantillas: un solo libro y una sola pantalla** (2026-10-11, `a37fdec` `9c03807` `4930097`, sin migración, **sin
  desplegar**): reconciliación con la WABA al abrir la pantalla y adopción en el 400 «ya existe»; catálogo 13 → 16 con las
  tres nuevas juntas (B3, B6); una pantalla para Twilio y Zernio, Biblioteca para campañas y libres en Zernio (B4, B5);
  Ajustes sin desplegables (OPER-4-bis); N5-bis. → `CHANGELOG.md`, `docs/features/whatsapp-templates.md`.
- **Ciclo, fase 1A: la base del motor** (2026-10-11, `163c5a0`, migración **00070 aplicada el 12-10**, sin desplegar, nada se
  envía): estado del ciclo en `customers` (ciclo, fatiga, dormido, ritmo personal), libro de toques
  `customer_cycle_touches`, triggers de alta, visita (reinicio + atribución a 14 días + ritmo) y fatiga (por
  `campaigns.source`), backfill sin ráfaga; `src/lib/cycle-engine.ts` (los cuatro ritmos validados simulando),
  `src/lib/communications/registry.ts` (motor de piezas con paridad), ajustes `cycle_*`. Todos los escritores de
  `last_visit_at` pasan por el trigger (`incrementVisit()` + el alta, que es INSERT). → `CHANGELOG.md`,
  `docs/features/ritmo-adaptativo.md` §7, `PENDIENTES.md` §2.4.
- **P1-a: arreglos chicos de campañas y plantillas** (2026-10-11, sin migración, **sin desplegar**): el tope de 3 al mes
  ya no se apaga ante un error de base (lanza, en lotes, paginado) y la reactivación pagina; los crons ya no dicen «0
  marcas» por un fallo; `PUT settings` con lista cerrada y punteros Zernio solo por `promoteVersion()`; plantillas del
  catálogo con alcance de marca; caché de 60 s de la WABA; Twilio paginado; paridad catálogo ↔ código con 4
  excepciones. Lo nuevo que dejó: N5-bis, N23-bis, OPER-4-bis (`PENDIENTES.md` §3.3). → `CHANGELOG.md`.
- **AIOS v1.15.0 + v1.15.1** (2026-10-08, sin pushear, sin migración): un solo link de 30 días para que el cliente
  conecte su WhatsApp (página de Zernio en español al tocar «Empezar»), que no se da ni se abre si el número no está en
  el perfil del cliente y verificado en Meta; la compra de números de Colombia desde el AIOS, que fallaba siempre;
  contrato de Zernio al spec 1.241.0. Verificado: tsc · lint · build · script de pruebas · servidor local con la API
  real (el 604 sin verificar no abre Meta). **NO verificado:** una conexión completa (Tepuy espera su número).
- **Diseño del ciclo de recuperación** (2026-10-04, solo docs, sin migración): el pedido del dueño de rehacer campañas
  + calendario. Spec con el diagnóstico de lo que el cron hace de verdad (el insistente cada ~30 días sin tope; un
  fallo calla 30 días), la máquina de estados (activo → dormido → archivado, reinicio por visita, atribución a 14 días),
  cinco toques con huecos crecientes, fatiga a las 6, latido, escalera de premios con freno al «efecto Temu» (cooldown
  180 d), una sola plantilla nueva, la pantalla única con línea de 90 días + vista por fecha + crear en 3 campos,
  datos/triggers/endpoints, fases y métricas. Prototipo HTML navegable y prompt para las fases 0 y 1. **Segunda pasada el
  mismo día con la revisión del dueño:** aprobar en vez de crear, vocabulario de dueño, cajas por etapa en vez de
  histograma, ritmo del negocio en una pregunta, primer uso, adaptador por defecto, pausa en blackout, orden del toque
  trimestral, cruce de canal con `has_delivery_webhook`, hora y domingo, grupo de control, «Regalo que vence». → §3 0.CICLO.
- **ESCALA-3 y ESCALA-4** (2026-10-04, `bb177cd` → `main` `9a06670`, sin migración, **DESPLEGADO**): `POST /api/webhook/zernio` contesta 200 y deja
  el parseo con IA y el registro para después de la respuesta (`after()`), así que un mal día de OpenAI ya no le apaga el
  webhook a las marcas Zernio (Zernio pide 2xx en 5 s y lo apaga tras 10 fallos; la IA tardaba hasta ~16 s). El embudo sigue
  siendo único (motivo nuevo `intake_inesperado`). `getFullAnalytics()` pagina de a 1.000 (`leerTodo()` ahora en `src/lib/`),
  con orden total, y un fallo de base da 500 en vez de ceros. → `delivery-webhook.md`, `dashboard.md`, auditoría §8.
- **Ola 0 de seguridad** (2026-10-03, `0485098` + `ddfdf72`, migración **00069 sin aplicar**, sin desplegar; AIOS
  v1.13.2 `b1b2465`, sin pushear): `mystery-box/resolve` solo otorga lo que `check-in/status` ofrece
  (`getNivelOfrecido()`, una sola función) y tiene límite de tasa; la 00069 cierra toda `SECURITY DEFINER` de `public` a
  la anon key (salvo 4 helpers de RLS) y borra las políticas de la 00015; el `PUT` de settings exige alcance de marca
  (`src/lib/alcance-de-marca.ts`); `timingSafeEqual` en `webhook/delivery`; `logs-*.csv` ignorado; el AIOS dice
  24-72 h. → `points-mystery-box.md` §7.4.ter, `03-security.md`, auditoría §7.
- **Docs al día tras la auditoría** (2026-09-29, sin código): el dueño confirmó todas las migraciones aplicadas (§1;
  AISLA-2 pasó a vivo → 0.SEGURIDAD); corregidos los docs que mentían (`04-deployment.md` crons y costos,
  `scalability-analysis.md` marcado obsoleto, `DELEGACION_GUIDE.md`, `PROCESO_VENTAS_IMPLEMENTACION.md`, `CLAUDE.md`,
  tres comentarios) y escrito el prompt de la ola 0 (`docs/prompts/2026-09-29-ola-0-seguridad.md`).
- **Auditoría «qué falta para 1000 clientes»** (2026-09-28, solo lectura, sin código ni migración): producto + AIOS,
  6 auditores y 3 refutadores Sonnet, revisión Opus de lo crítico. 68 hallazgos (49 confirmados, 12 corregidos, 1
  refutado, 6 de Opus). Lo que no escala es la operación: ~17 acciones por alta, ~85 min/marca/mes, cero avisos, 18/31
  de la cola esperan al dueño. Dos agujeros entre marcas → §3 0.SEGURIDAD. → `docs/AUDITORIA-ESCALA-1000-2026-09-28.md`.
- **Autorizados Domicilio dentro de Domicilios** (2026-09-12, `1de033e`, pusheado, sin migración): dos pestañas
  en `/dashboard/domicilios` —«Domicilios» y «Autorizados» (`AutorizadosPanel.tsx`, la pantalla vieja tal cual)—;
  `/dashboard/authorized-numbers` redirige a `?tab=autorizados` y salió del menú. Patrón de Recompensas ›
  Redenciones (`useSyncExternalStore`, nunca `useSearchParams()`). Endpoints intactos. → `delivery-dashboard.md`.
- **Golden Bullet por tandas desde el panel** (2026-09-12, sin migración): al terminar el goteo desaparecían
  «se registraron» y «dijeron que no», y para otra parte de la misma base había que resubir el CSV. Ahora
  `confirm` guarda la base ENTERA (la tanda `queued`, el resto **`valid`** = sin programar; el estado ya
  estaba en el CHECK de la 00023), la pestaña **«Bases»** (ex «En curso») muestra cada base mientras exista
  con en la base / programados / sin programar / enviados / entregados / registrados / rechazos, y
  «Programar otra tanda» → `POST /continue` hereda plantilla, promo y advertencia de la tanda anterior
  (`campaigns.filters`). Una campaña por tanda: pausa y drenador intactos. De paso: **toda lectura de la
  base pagina de a 1.000** (PostgREST cortaba ahí en silencio). ⚠️ Los 6.438 de la base del 11 no están
  guardados: subir ese CSV UNA vez más (los 1.000 se excluyen solos) y de ahí en adelante todo desde el
  panel. → `docs/features/golden-bullet.md` § «Bases y tandas».
- **Golden Bullet, listo para la campaña de amor y amistad** (2026-09-11, sin migración, **desplegado** en `cc13745`):
  el CSV «no cargaba» porque el flag nacía apagado y el 403 era mudo (ahora hay botón para encenderlo y la
  página monta el Toaster); los tres textos del flujo se escriben en el panel (mensaje 1 con botones,
  respuestas al sí —con foto y `{nombre|¿cómo estás?}`— y al no); `{{2}}` es opcional; el normalizador de
  celulares ya no deja pasar extranjeros. Los dos CSV de Sushi Service (7.438 + 6.688) están en
  `Contactos/salida/GOLDEN-BULLET-*.csv`, fuera del repo. Faltan del dueño: invitación con premio,
  plantilla a Meta (24-48 h), billetera COP y saldo Twilio (ver 0.GB).
- **Rendimiento del equipo** (2026-09-11, migración `00065`, **aplicada y desplegada**): el dueño preguntó dónde se
  veía cuántos clientes escaneó cada mesero y qué mesas piden más, y la respuesta era «en ningún lado»: los
  datos se guardaban desde la 00009/00018 y nadie los leía. Apartado nuevo **«Rendimiento»**
  (`/dashboard/rendimiento`): escaneos · nuevos · frecuentes · premios por mesero, y mesas por escaneos y premios.
  «Nuevo» = primera visita del cliente en la marca (por historia, no por flag). Sin mesero / sin mesa = fila
  propia. Nada en pesos. → `docs/features/staff-activity.md`.
- **El AIOS borra, deshace y recarga** (2026-09-11, migración `00064`, **SIN aplicar**; AIOS v1.11.0
  local): `aios_delete_tenant` (toda tabla con `tenant_id`, por pasadas, nunca el puente ni >100
  comensales, `dry_run` por defecto) detrás de `POST /api/aios/tenant-delete`, que además borra los
  usuarios de Auth por GoTrue; `aios_deactivate_whatsapp` (Tepuy tenía el número del simulador);
  `aios_wallet_topup` solo Twilio. En el AIOS: lista en dos grupos Twilio \| Zernio, «Simulado» en
  vez de un cupo inventado, y el retorno del Embedded Signup escribe solo por una función `anon`
  con candado (00010). → `docs/features/aios-borrado.md`.
- **Invitaciones con premio** (2026-09-11, migración `00063`): un enlace `/c/{slug}` o su QR que
  regala algo a quien se registre; el premio le queda en la tarjeta desde el registro y **solo se
  entrega cuando el mesero lo escanea**. No hay «tarjeta provisional»: el premio es un `reward_grant`
  con `source='invite'`. Quien llega por invitación **no** suma la visita #1 hasta que viene — se
  fuerza por el ORIGEN del registro, no con el interruptor global. Recompensas pasó a ser una
  pantalla con tres pestañas (Niveles · Invitaciones · Redenciones); `/dashboard/redemptions`
  redirige. Golden Bullet puede usar una invitación como regalo de bienvenida. Referidos (§2 del
  diseño) sigue sin construir y se para encima de esto. → `docs/features/invite-campaigns.md`.
- **Meseros rotativos** (2026-09-11, migración `00062`, **aplicada y desplegada**): el
  panel obligaba a UNA sede por mesero (D11) y «la mayoría son rotativos». Estado explícito
  `staff_users.works_any_location` —no se reinterpreta el NULL, que sigue siendo «sin sede
  asignada» y sigue sin backfillearse—: el rotativo tiene sede NULL (CHECK), sale en la lista de
  TODOS los aparatos de la marca además de los de cada sede, y la visita se atribuye a la sede
  del APARATO. Cuarta llave de identidad (UNIQUE de nombre entre rotativos + trigger anti-cruce
  con los de sede). Selector de Sede con «Rota entre sedes» en Crear, Editar y en masa. D11
  revisada, no derogada: una fila, una persona, una sede por visita; lo prohibido sigue siendo
  «de dos». → `docs/features/staff-qr-scan.md` § «Meseros rotativos».
- **El asistente dejó de ofrecer plantillas que romperían el envío entero** (2026-09-10, sin
  migración): las MARKETING del catálogo llevan 3 o 4 variables y Golden Bullet solo rellena dos,
  así que elegir una mandaba un envío con variables faltantes que el proveedor rechaza al 100% de
  los destinatarios — y solo se veía después de confirmar. Ahora se ofrecen únicamente las que
  usan `{{1}}` y `{{2}}`.
- **El goteo dejó de ser a ciegas** (2026-09-10, sin migración): pestaña «En curso» con lo que
  salió HOY y **botón de parar**. Pausar NO es un estado nuevo —sería un error caro: el
  anti-duplicado de la 00038 solo cubre `status='queued'`, así que sacar un item de ahí libera
  su hueco y la campaña se podría re-encolar entera— sino `not_before` en el año 9999.
  Reanudar reprograma desde hoy y acepta otro ritmo. La plantilla se crea desde el panel, sin
  copiar tokens. El bloque que se propone por defecto pasó a ser **la mitad** del cupo: los
  cumpleaños no pasan por esta cola y un goteo que vacía el presupuesto de madrugada los mata.
- **Golden Bullet por bloques + el freno de línea encendido** (2026-09-10, migración `00060`):
  encolaba nada y enviaba todo dentro del request — con 25.000 contactos moría a los 300 s.
  Ahora reparte en bloques diarios con un `not_before` escalonado (el drenador no cambió) y
  `/api/cron/line-health` escribe por fin `messaging_daily_limit`, que estaba en NULL en las
  5 marcas: el freno de la 00037 llevaba desde agosto **medido y apagado**. De paso:
  `isPhoneOptedOut()` miraba solo `customers`, así que el "no" de quien nunca fue cliente no
  lo leía nadie.
- **El píxel de Cada1 queda apagado** (2026-09-11, solo docs): el dueño preguntó para qué le servía un píxel
  propio y la respuesta honesta es que solo para tirar campañas a los comensales de sus clientes; hacerlo con la
  base de una marca para otra es tratamiento sin autorización (Ley 1581: finalidad y responsable), y con la de
  cada marca para esa marca lo hace igual de bien el píxel de la propia marca. El código queda (dos variables
  vacías = cero bytes de Meta), la decisión vive en `meta-pixel.md`. Si un día ofrece «yo te manejo los
  anuncios», el camino es acceso de socio a la cuenta publicitaria del restaurante, no un píxel de Cada1.
- **La API de Conversiones de Meta** (2026-09-11, **migración `00061`, SIN aplicar**): cada registro y
  cada check-in se manda también desde el servidor (`after()` en `POST /api/check-in`) con el celular
  **hasheado SHA-256**, a los dos píxeles, cada uno con SU token (Cada1: env; la marca:
  `tenant_integration_secrets`, solo service role, ningún endpoint lo devuelve). Navegador y servidor
  comparten un `event_id` **determinista** (`reg-<customer.id>` / `visit-<visit.id>`) porque el
  navegador dispara a veces mucho después (el QR del mesero); `status` lo devuelve. **Con mesero no
  viajan IP, user-agent ni `_fbp`**: serían del mesero y Meta aprendería que su celular es cada
  cliente. La primera visita no es `CheckIn`. La casilla del check-in y `/privacidad` §7 dicen que el
  celular sale cifrado y que cifrado no es anónimo. → `docs/features/meta-pixel.md`.
- **El píxel de Meta, y la política que lo dice** (2026-09-10, sin migración): las páginas públicas
  disparan `PageView`, `CompleteRegistration` (cliente nuevo) y `CheckIn` (el que vuelve; el
  duplicado NO cuenta). **Son DOS píxeles y no uno**, porque un píxel solo alimenta a la cuenta que
  lo creó: el de Cada1 (`NEXT_PUBLIC_META_PIXEL_ID`, el mismo en las 25 marcas, con el slug y la
  sede en cada evento) y el propio de cada restaurante (Configuración → Píxel de Meta, que estrena
  `config.integrations` con su ÚNICA ruta en la whitelist — un id de píxel es público y no lo
  escribe ningún OAuth; un token sigue sin entrar ahí ni nunca). **A Meta no le va ni un dato
  personal**: solo marca, sede y pantalla, por una única fábrica con un test que fija la lista de
  claves. **`/mesero/*` no se mide** — cuarenta escaneos por turno meterían al empleado en la
  audiencia como el cliente más fiel de la marca —, y el aviso al cliente sale del MISMO predicado
  que el script, así que no puede haber una página que mida sin avisar. La política de privacidad
  estrena §7 (qué se manda, qué no, cómo evitarlo) y §6 dejó de decir que no compartimos nada con
  terceros, que ya no era verdad. → `docs/features/meta-pixel.md`.
- **Los tres huecos del día 1 de una marca de 12 sedes** (2026-09-09, sin migración): (a) asignar
  sede a los meseros deja de ser un formulario por persona — `/dashboard/staff` gana «Asignar sede a
  varios a la vez», que **no adivina nada** (solo deja marcar a quien NO tiene sede y repite por
  dentro el mismo `PATCH` del lápiz, uno por uno, con las guardas del motor intactas); (b)
  `authorized_numbers.location_id` **ya se escribe** desde el panel —existía desde la 00043 y nadie
  lo escribía, así que todos los domicilios de todas las sedes caían en «sede desconocida»— con la
  guarda de que un administrador de sede no se los lleve a la sede hermana (`decidirSedeDestino()`,
  7 pruebas); (c) el cupo de envío, que es de la MARCA y falla CERRADO **en silencio**, se ve ahora
  en `/dashboard/campaigns` y avisa al 75 % — antes solo estaba en Conexiones, que con `owner_email`
  vacío solo abre el super-admin. **El modelo de cupo NO se tocó** (es F9, choca con D6).
  → `docs/features/delivery-webhook.md`, `send-governance.md`, `RUNBOOK-DEPLOY.md` §8.
- **Copiarle los premios a una sede ya no regala premios** (2026-09-09, **migración `00059`,
  SIN aplicar**): el «ya reclamé» se llevaba por `tier_id` y los niveles propios de una sede son
  COPIAS con ids nuevos, así que «Darle premios propios» le devolvía a los 542 clientes de la
  marca todos sus niveles sin reclamar allí — un regalo masivo a un botón de distancia. Ahora un
  nivel tiene identidad propia (`reward_tiers.tier_key`, que la copia HEREDA) y cada reclamo se
  sella con esa clave **y** con el umbral cruzado; vale cualquiera de las dos, que es la lectura
  conservadora a propósito. `customers.current_tier` pasa a ser el nivel de la MARCA: con
  escaleras por sede podía RETROCEDER de nombre mientras el cliente subía de puntos.
  → `docs/features/points-mystery-box.md` §7.1.bis y §7.4.bis.
- **Los premios ya no los cambia un administrador de sede** (2026-09-09, sin migración): los
  cuatro verbos de `/api/dashboard/reward-tiers` autenticaban con `requireTenantId()`, que solo
  mira que el JWT traiga una marca — así que un `role='location'` editaba y borraba los premios
  de la marca **y los de sus sedes hermanas**, y la pantalla se lo ofrecía por defecto. Ahora las
  tres escrituras pasan por `exigirAlcanceDeMarca()`; el GET se queda como estaba **a propósito**
  (leer no cruza marcas, y exigir alcance ahí daría 403 a todos: el panel pide `?location_id=brand`,
  que `decideLocationScope()` rechaza). La decisión vive en `puedeEscribirEnLaMarca()`, que es PURA
  y lleva el `OR` del operador de Cada1 que el RLS ya tenía (`is_super_admin()`, 00045) y el TS no:
  sin él, el operador perdía el panel de todo cliente con dos sedes. Falla CERRADO, y un fallo de
  base sale como 500, no como 403. Con 0 o 1 sede activa nada cambia. Y «Accesos» avisa, al elegir
  «Administrador de sede», que esa persona ve su sede **desde hoy** y no el histórico (0.DELTA (b)).
  → `docs/features/multi-sede.md` §3.septies.
- **Cada sede manda a reseñar SU ficha de Google** (2026-09-09, sin migración, **en `main`**):
  `getReviewPromptState` recibía solo la marca aunque `review-prompt/route.ts:52` ya tenía la
  sede resuelta en la variable de al lado. Guardar y mostrar el link por sede ya funcionaba;
  mandar a reseñar, no. Era el requisito original del dueño. → `docs/features/review-flow.md`.
- **Las recompensas ya varían por sede** (2026-09-08, dentro de la `00058`): el cuello de botella no
  eran los llamadores de `getAllTiers` sino TRES funciones intermedias con 18 call-sites
  (`evaluateNewTier`, `getNextTier`, `buildTiersRoadmap`). Enhebrado en check-in, domicilios, tarjeta,
  `check-in/status`, las dos rutas públicas y la mystery box. **Sin sede a propósito**: el override del
  panel y los crons (no existe una «sede del acto»; esa cascada es F6). Pantalla con selector de alcance
  y `/reward-tiers/copiar`, que evita que una sede se quede con UN solo premio al crear el primero.
- **Las sedes ya son del cliente** (2026-09-08, **migración `00058`, SIN aplicar**): hasta hoy
  multi-sede era una función NUESTRA — el cliente filtraba por sede pero solo podía editar la
  principal, y solo su geocerca. Ahora **`/dashboard/sedes`** (ver, elegir y editar cualquier
  sede: ficha de Google, dirección, horario, teléfonos, redes) y **`/dashboard/accesos`**
  (super usuario / administrador de sede, altas, bajas y **contraseña nueva**). La 00041 había
  dejado `restaurant_locations.config` sin whitelist ni escritor, así que las dos sedes de una
  marca mandaban a reseñar **la misma ficha de Google**: la de la segunda nacía muerta.
  Con 0 o 1 sede activa ninguna marca ve un solo cambio. → `docs/features/multi-sede.md` §3.septies.
- **Se puede cambiar una contraseña** (2026-09-08, sin migración): hasta hoy **no podía nadie**.
  El AIOS remitía a «olvidé mi contraseña» y ese flujo **no existe** en el producto (no hay
  `resetPasswordForEmail`, `/login` no tiene enlace). Ahora desde «Accesos» y desde el AIOS
  (`reset_password` en `/api/aios/tenant-admin`). El autoservicio sigue faltando: §3 punto 0.quater.
- **El alta del AIOS pregunta bien** (2026-09-08, AIOS v1.9.0, **migración `00009` del AIOS, SIN
  aplicar**): «¿cuántas sedes?» no distinguía un GRUPO (comparten marca, clientes y puntos) de una
  FRANQUICIA (no comparten nada) — las dos contestaban «varias» y la diferencia solo se veía cuando
  ya era irreversible. **Tepuy nació de ahí.** `site_model` pasa a `single | group | franchise`.
- **El subdominio de una sede ya resuelve la marca en TODO lo público** (2026-09-08, sin migración,
  **en `main`**): la tarjeta, `/api/check-in/status`, `/api/mystery-box/resolve` y las tres rutas de
  `/api/public/*` resolvían con `getTenantByDomain()` (solo `tenants.domain`) y respondían **404** en el
  subdominio de una sede; el branding caía a `DEFAULT_BRANDING`, o sea **el cliente veía Sushi Service al
  escanear el QR de su sede**. Nuevo `getTenantByHost()`, que es el cuerpo que ya usaba
  `resolveHostContext()`. Lo destapó Tepuy. → `docs/features/multi-sede.md` §3.quinquies.
- **El cliente ya nace con usuario** (2026-09-08, sin migración, **en `main` y pusheado**): el AIOS dejaba la marca
  completa y el cliente abría su enlace **sin con qué entrar**. Ahora `POST /api/aios/tenant-admin`
  (llave: `x-aios-secret`, **503 sin la variable**) + tarjeta «Usuario del panel» del AIOS v1.7.0. Nunca da
  `super_admin`, nunca reatribuye un usuario de otra marca (409), nunca cambia una contraseña existente; con
  2+ sedes crea la fila `role='brand'` que evita el 403. → `docs/features/alta-usuario-admin.md`.
- **Cambios pre-reunión** (2026-09-08, `596fb5b`, **en `main` y pusheado**, sin migración): "Identidad visual" pasa a
  **"Tarjeta principal"**; la tarjeta muestra símbolo del sello (20), decoración de contorno (6), redes, perfil de
  Google, descripción, contacto/horario y políticas, plegados (`CardExtras`/`CardMotif`/`StampIcon`; se guarda en
  `config.card.*` + `instagram_url`/`whatsapp_link` por la whitelist, listas cerradas para los dibujos). **Sin config
  no cambia nada.** Premios de campaña vive como pestaña de Campañas (la ruta vieja redirige). Domicilios: cuadro
  modelo con "Copiar modelo" y pasos plegables. → `docs/features/identidad-visual.md`, `campaigns.md`, `delivery-dashboard.md`.
- **El AIOS aprende lo que es una sede** (2026-09-07, F8): creaba **un tenant por sede**, así que un negocio
  con dos locales nacía como dos MARCAS. Migración **`00056`** (`aios_add_location`, `aios_set_location`, y
  `aios_provision_tenant` reemplazada porque no escribía `slug` ni `domain`: un alta de dos sedes nacía
  **creada pero muerta**). → `docs/features/multi-sede.md` §2.bis.
- **Un domicilio perdido deja rastro** (2026-09-07, ROJO 3, **en `main`, sin desplegar**): `delivery_intake_failures`
  (00053). El INSERT vive dentro de `logDeliveryIntakeFailure()`, que pasa a `async`. Con ella va `aios_health()`.
- **Conexiones: el cliente conecta su propio WhatsApp** (2026-09-07, **en `main`**, 00054). Destapó que el
  `redirect_url` apuntaba a `/api/webhook/zernio` (405 a un navegador) y que `verification_required` no lo miraba
  nadie. Nonce del `state` NUESTRO; `isTenantOwner()` fail-closed. → `docs/features/conexiones.md`.
- **Lo del 2026-09-06, desplegado** (detalle en `CHANGELOG.md`): `SALIR` visible y contestado · los 3 AMARILLO del
  calendario · Recovery Zone · alta de mesero por ROL · Sushi Fun absorbido (1.421 filas). Con migración sin aplicar:
  enlace del evento (00050) y dominio cruzado simétrico D2 (00051). Lo anterior (§19, F7/F4/F3, identidad visual) está desplegado.

## 6. Deudas y límites conocidos

**Multi-sede** (`docs/features/multi-sede.md`): **D3** `is_primary`
sin UNIQUE por tenant · **D4** diagrama ER de DB_SCHEMA obsoleto · **D5** conteo de migraciones stale en comentarios ·
**D7** premios sin precio · **D8** adopción de histórico irreversible · **D9** el 409 de sede no acepta elección por API ·
**D12** campañas masivas con `location_id` NULL (es F6) · **D13** 5 columnas de sede vacías · **D15** FK simple en
`staff_devices.staff_user_id` (mitigada con trigger). **D1 y D17 CERRADAS por la `00058`**: la whitelist de
`restaurant_locations.config` existe (en la base) y el cliente edita cualquier sede desde `/dashboard/sedes`.

**Rutas que F7 dejó SIN cablear a propósito**: `send-queue` GET, `check-in-override`, `campaigns/manual`,
`imported-contacts/confirm`, `campaigns/run-auto`. El filtro de sede ahí es **no-op seguro (fail-closed)** hasta F6.

**De §19**: **D18** el token del aparato es el fingerprint del navegador y la ÚNICA credencial del local (aceptado) ·
**D19** un mesero sin teléfono en dos sedes cuenta como dos · **D20** quién activó un aparato solo queda en `device_name`.

**Fuera de multi-sede:**
- **00030 sin aplicar** (¿corrió el 29 con «todas»? §3 ítem 9): DEFAULT puente → un INSERT sin `tenant_id` se va
  calladito a Sushi Service. La auditoría del 28 no encontró ninguno en `src/`: el riesgo es la falta de red.
  Y **17.b**: "quién es Black" difiere entre la tarjeta (`black-tier.ts`) y el panel (`POWER_RANKS`).
- **Huecos de migración**: `00048` y `00049` los citó el diseño (F9 se escribió, pero como `00058`; F10 no);
  `00052` y `00055` los fabricó el script viejo al leer una cita como reserva. Ninguno se rellena.
- **Choques de migración en ramas muertas**: `sushi-sync` (00015) y `port/sushi-fun-2.8` (00028).
- **Catálogo de producto sin empezar** (referidos, push, fatiga, tier máximo, multi-sede F5/F6): `docs/ESTADO-CONSOLIDADO-2026-10-04.md` §1 y §9 (P8).
- **Plantillas (2026-09-11, revisado el 2026-10-11)**: escritores de `admin_settings.*_template_sid` fuera de
  `promoteVersion()`: `fillEmptyPointer()`, el «Elegir otra» de Twilio (`PUT` de settings) y el paso 5 del AIOS (B7) ·
  una PAUSED ya se VE en Plantillas, pero sigue apuntada y nadie avisa · `no_template_configured` no llega a ninguna
  pantalla · `flujo-plantillas-recompensas-campanas.md` describe un contrato que ya no existe. Plan:
  `docs/PENDIENTES.md` §3.

## 7. Reglas de esta casa

- **Cada sesión abre y cierra igual** (`CLAUDE.md` § "Cada sesión"): al abrir, fila en §2 commiteada sola; al cerrar,
  tsc · lint · tests, fila borrada, `CHANGELOG.md` (≤15 líneas), `graphify update .`, commit por nombre.
- **Varias a la vez: misma carpeta, misma rama, territorios por archivo.** Nadie cambia de rama, nadie hace `stash`
  ni `reset --hard`, nadie hace `git add -A`. Una corrida de tests a la vez. Worktrees solo como excepción declarada.
- **El número de una migración sale de `node scripts/proxima-migracion.mjs`** y se escribe en la fila del §2: esa es la reserva.
- **La migración se aplica ANTES de desplegar el código que la usa.** Con la 00047 se hizo al revés y salió barato
  de casualidad; con la 00044 habría dado 403 a todos los meseros.
- **Push y deploy son del dueño.** Un push de `main` despliega.
- **Cerrar las sesiones viejas.** Cada mensaje re-factura todo el historial.
- **El grafo antes que el grep**: `graphify query` cuesta 1-2 k tokens; leer "los relevantes", 30-80 k.
- **Modelo por defecto para implementar: Sonnet.** Opus para diseño, planificar el día y el cierre. Haiku para auditorías.
- **Prompts con alcance cerrado**: tarea · guardrails · criterio de término. Nada de "revisá todo el repo".
- **Nada de carpetas fuera del proyecto.** Los respaldos van a GitHub (dueño, 2026-09-06).
