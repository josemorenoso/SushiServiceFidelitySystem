# Pulido Visual — pantallas de cara al cliente y al mesero

> Rama `feat/pulido-visual`. Solo presentación: cero cambios de lógica, API, servicios o queries.
> Cada línea: pantalla — qué se veía mal — qué se hizo. Ordenado por impacto.

1. **Mesero (toda la app, 6 pantallas)** — los botones principales de acción (Iniciar sesión,
   Escanear QR de Cliente, Registrar Visita, Escanear siguiente cliente, Buscar cliente manual)
   usaban el rojo genérico de Tailwind (`bg-red-500`), un tono distinto del rojo de marca
   (`#FF4D6D → #E63946`) que usan check-in y la tarjeta — el mismo botón "acción principal" se
   veía como dos productos distintos. Se reemplazó por `.btn-premium`, la clase ya existente del
   design system (mismo gradiente, mismo glow al hover, misma atenuación al deshabilitar), sin
   tocar tamaños ni textos. Archivos: `mesero/page.tsx`, `mesero/dashboard/page.tsx`,
   `mesero/scan/page.tsx`, `mesero/confirm/page.tsx`.
2. **Mesero (6 botones ícono, 4 pantallas)** — los botones circulares de volver/linterna/teclado/
   cerrar sesión (`rounded-xl p-2` sobre un ícono de 20px) medían ~36px de lado: por debajo del
   mínimo táctil de 44px que pide el uso a una mano en el local. Se fijó el tamaño a `h-11 w-11`
   (44px) explícito en `mesero/dashboard/page.tsx` (cerrar sesión), `mesero/scan/page.tsx`
   (volver, linterna, teclado), `mesero/confirm/page.tsx` (volver) y `mesero/rewards/page.tsx`
   (volver).
3. **Tarjeta digital (`/tarjeta`)** — el único CTA hacia el check-in ("Escanea el QR en mesa...")
   era un link de una sola línea de texto dentro de una tarjeta más grande; solo esa línea
   respondía al toque, con un área táctil muy angosta. Ahora toda la tarjeta CTA es el `<a>`
   (mismo destino, mismo texto, mismo estilo), así que cualquier toque en esa zona navega.
   Archivo: `src/components/features/wallet/WalletCard.tsx`.
4. **Check-in (formulario de registro)** — el botón "×" para borrar la ciudad seleccionada era un
   glifo de texto sin padding (~18×18px), un objetivo táctil diminuto en un campo que el cliente
   llena parado con el celular en una mano. Se agrandó a una zona de 40×40px centrada y se le
   sumó `aria-label`; el input gana `pr-10` solo cuando el botón está visible para no tapar el
   texto. Archivo: `src/components/features/check-in/CheckInForm.tsx`.
5. **Check-in (tarjeta del cliente / `CustomerCard`)** — el botón "Volver" del QR dinámico era
   puro texto sin relleno vertical, con una zona de toque más baja que el resto de los controles
   de la pantalla. Se le sumó `py-2` para emparejar el tamaño táctil sin cambiar su aspecto.
   Archivo: `src/components/features/check-in/CustomerCard.tsx`.

## Visto pero NO tocado (fuera de alcance)

- **`mesero/error.tsx`** muestra el stack trace crudo del error a cualquier mesero ante un
  crash. Se ve muy "de desarrollador" y no de producto terminado, pero el propio código dice que
  es intencional ("Captura esta pantalla y envíala al desarrollador") mientras se estabiliza el
  escáner de QR en la semana de demos. Tocarlo significa decidir si se apaga ese diagnóstico —
  decisión de producto, no de estilo.
- **Paleta de mesero vs. paleta premium**: más allá de los botones primarios (ya unificados),
  el resto de la app del mesero sigue en gris/blanco plano (`bg-gray-50`, `rounded-xl`, sin
  `font-playfair` ni `.premium-card`) mientras check-in y la tarjeta usan el sistema completo
  "Hospitality Editorial" (marfil, Playfair, glassmorphism). Reskinearlo por completo es un
  rediseño, no un pulido — se dejó así a propósito para no arriesgar que el dueño no reconozca
  la herramienta del mesero mañana.
- **Selects de cumpleaños sin flecha** (`CheckInForm.tsx`, paso de registro): usan
  `appearance-none` sin ícono de reemplazo, así que Día/Mes/Año no muestran ninguna afordancia
  visual de que son desplegables (el picker nativo igual aparece al tocar). Agregar un ícono
  requería repartir el padding para no descentrar el texto — cambio visible en 3 campos por un
  beneficio marginal, se dejó fuera para no introducir riesgo.
- **`reward_tiers.is_black` vs `POWER_RANKS`** (documentado en `wallet-card.md`, pregunta 17.b
  abierta): no es un problema visual, pero conviene que el dueño sepa que sigue sin resolver.
