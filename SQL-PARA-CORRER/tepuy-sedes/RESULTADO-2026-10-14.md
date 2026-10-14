# Tepuy — resultado del diagnóstico de sedes (2026-10-14)

Lo corrió el dueño en el Supabase del producto el 2026-10-14 (`01-DIAGNOSTICO.sql`, solo lectura). Lo leyó el
comandante y se lo pasó a las sesiones de `docs/prompts/2026-10-14-sedes-separadas.md` (partes 1 y 3).

| Qué | Envigado | Laureles | Sin sede | Total |
|---|---|---|---|---|
| Sede activa, con su subdominio | sí (`clubtepuyenvigado.constelarys.com`) | sí (`clubtepuylaureles.constelarys.com`) | — | 2 |
| Clientes registrados ahí (`origin_location_id`) | **23** | **17** | 0 | 40 |
| Visitas | 24 (23 por el QR de la sede, 1 por un aparato de mesero) | 17 (por el QR de la sede) | 0 | 41 |
| Visitas con el QR de la OTRA sede (`location_conflict`) | 1 | 0 | — | 1 |
| Clientes distintos que fueron | 24 | 17 | — | 40 (**1 fue a las dos**) |
| Meseros activos | 1 | 1 | — | 10 (**8 «rota entre sedes»**) |
| Aparatos de mesero | **0** | 3 | 0 | 3 |
| Premios entregados | 0 | 0 | 0 | 0 (no hay canjes todavía) |

## Qué dice

1. **Los datos están bien: todo tiene sede.** El problema que vio el dueño («Envigado y Laureles dicen 40») es de la
   pantalla, no de los datos: el panel cuenta los clientes de toda la marca aunque se elija una sede. La parte 1 lo
   arregla, y con estos datos la fila «sin sede» no aparece.
2. **Laureles no tiene 0 clientes: tiene 17.** El dueño creía que todo era de Envigado.
3. **Envigado no tiene ningún aparato de mesero.** Los 3 están en Laureles. Con 8 meseros rotativos, la visita se
   atribuye a la sede del APARATO: si un mesero escanea en Envigado con un celular activado en Laureles, esa visita
   cuenta para Laureles. Hoy no pesa (las visitas de Envigado entraron por el QR de la sede), pero va a pesar.
   **Gesto del dueño:** activar al menos un aparato en Envigado, entrando por `clubtepuyenvigado.constelarys.com/mesero`
   y eligiendo Envigado como sede, y comprobar que los 3 de Laureles estén de verdad en Laureles.
4. La visita con el QR de otra sede es justo el caso de diseño: un cliente de Laureles atendido en Envigado. Ganó el
   aparato (como debe ser) y quedó marcada. Hoy no hay aparato de Envigado, así que el que la registró cambió de sede
   después o ya no existe: no se investigó (es una visita).
