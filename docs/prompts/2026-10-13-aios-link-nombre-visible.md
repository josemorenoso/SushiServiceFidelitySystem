# Prompt — AIOS: el link de conexión no deja el nombre de la persona como nombre de WhatsApp (2026-10-13)

> Escrito por el comandante (Opus 5.5) el día que Tepuy conectó su WhatsApp. **Modelo recomendado: Sonnet.** Una sesión
> chica. Se abre en la raíz del repo del producto; el código está en el repo anidado `Level 2.0/aios-constelarys`.

---

Eres una sesión de Claude Code. Trabajas en el **AIOS** (`Level 2.0/aios-constelarys`, repo git propio, Next.js, sin suite
de tests). El tablero de sesiones vive en el `ESTADO.md` del producto (raíz).

## Qué pasó (13-10, verificado contra la API de Zernio)

Tepuy abrió el link de `/conectar/[token]` (v1.15.1) y conectó bien: número +57 604 201 1012 en el perfil `tepuy`, WABA
`2315429052538548`, cupo `TIER_2K`. Pero en el paso «Perfil de WhatsApp Business» de la ventana de Meta, el **nombre
visible** venía lleno con el nombre del portafolio, que es el nombre PERSONAL de la dueña («Yenifer Yohana Calle Morera»).
Ella no lo cambió y Meta lo aprobó al instante (`verifiedName`, `nameStatus: APPROVED`): sus clientes verían su nombre y no
«Tepuy». El `brandName` que manda el AIOS (`src/lib/zernio/client.ts`, `signup=hosted`) solo pinta la página de Zernio; no
llega a Meta. Y las instrucciones de la página hablan del número pero no del nombre. Además, después de conectar, Zernio
marca la cuenta con «Can't start new conversations» (falta método de pago y verificación del negocio) y el AIOS no lo
muestra en ningún lado. El arreglo de Tepuy es manual (lo hace la dueña): no es tu tarea.

## 1. Antes de tocar nada

1. Lee el `ESTADO.md` del producto (raíz) entero. Anota tu fila en §2: «AIOS: nombre visible en el link de conexión»,
   tu modelo y los archivos de la sección 3. Commitea SOLO `ESTADO.md` (en el repo del producto).
2. Lee `Level 2.0/aios-constelarys/docs/features/whatsapp-connect-link.md`, el contrato
   `Level 2.0/aios-constelarys/docs/zernio-api-contract.md` §3.a y §3.b, y la página `src/app/conectar/[token]/page.tsx`
   y `ir/`.

## 2. Qué construir

1. **La página del link** (`/conectar/[token]`): un paso nuevo, antes del del número, que diga en una línea: en «Nombre
   visible» escribe **{nombre de la marca}** (lo que verán tus clientes en WhatsApp), no tu nombre. Y otra: si tu
   portafolio de negocio tiene tu nombre personal, igual elígelo. **Toda la página pasa de vos a tú** (los clientes son
   colombianos: «Conecta», «Elige», «Toca»). Breve: el cliente no tiene paciencia.
2. **¿Se puede llenar el nombre visible solo?** Busca en la spec pública de Zernio (la del contrato, 1.241.0 o la vigente)
   si `GET /v1/connect/whatsapp` (con o sin `signup=hosted`) acepta datos para pre-llenar el Embedded Signup de Meta
   (nombre del negocio, nombre visible, categoría). Meta lo permite en ese flujo. **Si existe**, mándalo con el nombre de
   la marca y documéntalo en el contrato como VERIFICADO (con dónde lo viste). **Si no existe**, no lo inventes (regla:
   las rutas de Zernio salen del contrato): deja escrito en el doc de la feature el mensaje para el soporte de Zernio,
   listo para que el dueño lo copie.
3. **Lo que falta para enviar, a la vista.** Busca en la spec si hay un endpoint que diga por qué una cuenta de WhatsApp no
   puede iniciar conversaciones (método de pago, verificación del negocio, estado del nombre visible). **Si existe**, que el
   paso 3 del AIOS, ya conectado, lo muestre en español con lo que el dueño del negocio tiene que hacer. Solo `GET`. **Si
   no existe**, anótalo en el doc y no lo construyas.
4. Docs: `whatsapp-connect-link.md` (estado: conexión de punta a punta **verificada con Tepuy el 13-10**; el hueco del
   nombre y cómo quedó), el contrato §3.a («Caso real — Tepuy»: el desenlace), `CHANGELOG.md` del AIOS, versión 1.15.2 en
   `package.json`.

## 3. Territorio y reglas

- Territorio: `Level 2.0/aios-constelarys/src/app/conectar/**`, `src/lib/zernio/client.ts` (solo si 2.2 o 2.3 existen),
  el componente del paso 3 (solo para 2.3), `docs/features/whatsapp-connect-link.md`, `docs/zernio-api-contract.md`,
  `CHANGELOG.md` y `package.json` del AIOS. Del producto: solo tu fila en `ESTADO.md` y, al cerrar, 0.AIOS en §3.
- **No llames a Zernio con nada que escriba** (ni `POST`, ni `PATCH`, ni generar links de clientes reales). Solo `GET`
  para leer la spec si hace falta. Cambiar `AIOS_CONNECT_LINK_SECRET` invalida los links enviados: no lo toques.
- Git: solo tus archivos, por nombre, en cada repo. Nunca `git add -A`, ni cambiar de rama, ni `stash`, ni `reset --hard`.
  Commits locales sí; **push NO** (lo ordena el dueño).
- Cierre: en el AIOS `npx tsc --noEmit`, `npm run lint` (sin errores nuevos en lo tocado) y `npm run build`. Borra tu fila
  del `ESTADO.md` del producto.

## 4. Tu respuesta final (el dueño se la pasa al comandante)

Hashes (de los dos repos), archivos, qué encontraste en la spec para 2.2 y 2.3 (con la evidencia), tsc/lint/build, y lo
que no coincida con este prompt.
