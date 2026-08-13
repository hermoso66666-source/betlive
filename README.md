BetLive V4.5 — parche de sincronización API-Football y control de cuota

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


## V4.5 — API-Football en vivo y pre-match

Variables recomendadas en Render:
- `API_FOOTBALL_KEY` = clave privada de API-Football.
- `LIVE_SYNC_ENABLED=true`
- `LIVE_SYNC_INTERVAL_MS=30000` (30 segundos por defecto; el backend nunca baja de 15 segundos).
- `UPCOMING_CACHE_MS=10800000` (3 horas por defecto).
- `UPCOMING_ODDS_MAX_PAGES=1` (1 página por fecha para proteger el límite Free).
- `API_MIN_REQUEST_GAP_MS=1500` (separación mínima entre llamadas del backend).
- `API_LOW_REMAINING_THRESHOLD=5` (si el proveedor reporta 5 o menos solicitudes restantes, se pausa temporalmente la sincronización).
- `API_PREFERRED_BOOKMAKER` (opcional; texto parcial del nombre del bookmaker que prefieres).

### Qué se corrigió
- Se conserva `API_FOOTBALL_KEY` únicamente en backend.
- Live usa una sola consulta global de `/odds/live` por ciclo para no multiplicar llamadas por fixture.
- Ya no se usa ciegamente `bookmakers[0]`: para cada mercado se busca un bookmaker que realmente entregue valores/cuotas válidas.
- Las cuotas que desaparecen se cierran; no se inventan momios.
- Los mercados live ausentes de una respuesta válida se cierran para los fixtures que siguen live.
- Se leen los headers de cuota (`x-ratelimit-requests-remaining` / `X-RateLimit-Remaining`) y se expone el estado sin mostrar la API key.
- Se añade una separación mínima entre solicitudes para reducir ráfagas y respetar los límites del proveedor.
- Próximos partidos limita las páginas de `/odds?date=...` a una por fecha por defecto, evitando el patrón anterior de hasta 3 páginas por cada día.
- Si el proveedor entrega menos cuotas por falta de página, el diagnóstico de sincronización indica las fechas truncadas.
- El endpoint `/api/live/status` muestra el estado de la sincronización y la cuota reportada por API-Football.
- El frontend continúa leyendo PostgreSQL y el backend sigue siendo la autoridad final de las cuotas al crear tickets.

### Límite Free
No se recomienda configurar la sincronización live a 5 segundos. API-Football puede actualizar el feed con mucha mayor frecuencia, pero una cuenta Free no tiene capacidad para consultar continuamente a esa frecuencia. El valor de 45 minutos prioriza conservar cuota; para apuestas live reales con actualización frecuente se necesita un plan/API budget adecuado.

## Seguridad y operación

Antes de operar con dinero real hay que revisar los requisitos legales y regulatorios aplicables, además de implementar verificación de edad/identidad, controles antifraude, juego responsable y un proveedor de pagos autorizado.


## BetLive internal L-E-V market engine

The live feed now keeps API-Football as the source for fixtures, score and status, while BetLive can generate its own **L / E / V** market. The internal market is shown even when `/odds/live` returns no bookmaker markets.

Environment variables:
- `INTERNAL_LEV_ENABLED=true`
- `INTERNAL_LEV_MARGIN=0.06`
- `INTERNAL_LEV_BET_WEIGHT=0.10`
- `INTERNAL_LEV_MAX_PREDICTIONS_PER_RUN=5`
- `INTERNAL_LEV_PREDICTION_CACHE_MS=3600000`
- `LIVE_SYNC_INTERVAL_MS=30000`
- `API_MIN_REQUEST_GAP_MS=1500`

API-Football currently documents API-FOOTBALL 3.9.3 and the v3 endpoint `https://v3.football.api-sports.io/`; the live odds endpoint is optional for this internal market.
