# BetLive V27.2 — Depósitos acreditados automáticamente

Al aprobar una solicitud `DEPOSIT` desde Admin → Depósitos/retiros:

1. Se bloquea la solicitud durante la operación para evitar doble acreditación.
2. Se valida que siga `PENDING`.
3. Se suma `amount_cents` al `balance_cents` del usuario dentro de la misma transacción PostgreSQL.
4. Se registra el movimiento en `balance_transactions` con referencia a la solicitud.
5. Se marca la solicitud como `APPROVED` y se registra el administrador.
6. Si cualquier paso falla, se hace `ROLLBACK` y no se acredita parcialmente.

El botón del administrador ahora indica explícitamente que aprobar el depósito lo acredita automáticamente. Los retiros continúan separados: autorizar y posteriormente marcar como pagado.
