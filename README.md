BetLive V3.6 — corrección de menús móviles y caché de frontend

# BetLive — núcleo V3 + panel administrativo

Esta versión conserva la página principal y el login actual, pero amplía el backend y el panel para dejar lista la mayor parte de la arquitectura de la plataforma.

## Incluido

### Usuarios
- Registro/login por correo o teléfono.
- Sesión HttpOnly.
- Roles `user` / `admin`.
- Activar/bloquear usuarios.
- Saldo inicial de nuevos usuarios: `$0.00`.

### Billetera / ledger
- Historial de movimientos.
- Movimientos de apuesta, premio, anulación y ajustes administrativos.
- Solicitudes de depósito/retiro (manuales, sin pasarela de pago).
- Operaciones de saldo con transacciones PostgreSQL y bloqueo de fila.

### Eventos y cuotas
- Deportes, ligas, equipos, horarios y estados.
- Mercados y selecciones.
- Cuotas administrables desde el panel.
- Datos virtuales de demostración se crean automáticamente si la tabla está vacía.
- El navegador ya no decide la cuota final: al crear un ticket, el backend vuelve a consultar las selecciones y calcula la cuota.

### Tickets
- Sencilla y combinada.
- Validación de selecciones en servidor.
- Validación de saldo en servidor.
- Prevención de dos selecciones del mismo mercado.
- Descuento y creación del ticket dentro de una sola transacción.
- Liquidación administrativa: `WON`, `LOST`, `VOID`.

### Quinielas
- Quiniela Fácil y Quiniela Clásica de demostración.
- Precio configurable desde admin.
- Estado activo/inactivo.
- Fecha de cierre y texto de premios.
- API pública para que la página principal pueda consumirlas en la siguiente fase.

### Panel admin
Ruta: `/admin` o `/admin.html`

- Dashboard.
- Usuarios.
- Saldo e historial.
- Tickets y liquidación.
- Eventos.
- Mercados y cuotas.
- Quinielas.
- Solicitudes de depósito/retiro.
- Auditoría de acciones administrativas.

## Render

Variables obligatorias:

- `DATABASE_URL`
- `JWT_SECRET`
- `NODE_ENV=production`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME` (opcional)

Start Command: `npm start`

Health Check: `/api/health`

## Importante


Antes de operar con dinero real hay que revisar los requisitos legales y regulatorios aplicables, además de implementar verificación de edad/identidad, controles antifraude, juego responsable y un proveedor de pagos autorizado.


## OAuth y perfil (V3.2)
Configura en Render:
- `APP_BASE_URL=https://TU-DOMINIO`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Redirect URIs:
- Google: `https://TU-DOMINIO/api/auth/google/callback`



## V3.3 — Administración, depósitos manuales y mercados
- Panel Admin con perfil de jugador, edición de datos y ajuste de saldo con auditoría.
- Depósitos manuales: el administrador puede configurar banco, titular, cuenta, CLABE, tarjeta, referencia e instrucciones desde Admin.
- Retiros: el jugador registra método, titular, banco, cuenta/CLABE y teléfono; Admin recibe esos datos para validar.
- Retiro en dos pasos: Autorizar y después Marcar pagado. El saldo se descuenta al marcar el pago como realizado.
- Depósitos aprobados acreditan el saldo y generan movimiento.
- Mercados de apuestas adicionales por deporte: doble oportunidad, totales, ambos marcan, primer gol, córners, tarjetas, handicap/spread, totales de puntos/juegos/carreras y otros mercados base.
- El jugador visualiza las selecciones de todos los mercados disponibles del evento.
- Facebook permanece eliminado; Google OAuth se conserva.


## V3.5
- Historial de apuestas y apartado de apuestas pendientes para jugadores.
- Chat de soporte jugador ↔ admin con actualización periódica.
- Panel admin organizado por secciones y menú móvil.
- Datos de depósito/transferencia editables desde Admin → Depósito.
