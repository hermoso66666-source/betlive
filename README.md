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

Los eventos y cuotas incluidos son **virtuales/de demostración**. Las solicitudes de depósito/retiro no conectan con bancos, tarjetas, SPEI ni procesadores de pago. Google/Facebook OAuth todavía requiere configurar las credenciales de cada proveedor.

Antes de operar con dinero real hay que revisar los requisitos legales y regulatorios aplicables, además de implementar verificación de edad/identidad, controles antifraude, juego responsable y un proveedor de pagos autorizado.


## OAuth y perfil (V3.2)
Configura en Render:
- `APP_BASE_URL=https://TU-DOMINIO`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_GRAPH_VERSION` (opcional; por defecto `v25.0`)

Redirect URIs:
- Google: `https://TU-DOMINIO/api/auth/google/callback`
- Facebook: `https://TU-DOMINIO/api/auth/facebook/callback`

Google usa Authorization Code Flow en backend. Facebook usa OAuth redirect y Graph API. Los secretos nunca deben ir al frontend.
