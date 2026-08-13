# BetLive V6 — comprobación rápida

Después de desplegar:

1. `/api/health`
   - `intervalMs` debe ser 15000–60000.
   - `databaseState.liveEvents` debe indicar los LIVE que existen en BetLive.
   - `databaseState.openInternalMarkets` debe ser > 0 si existen LIVE.
   - `databaseState.openInternalSelections` debe ser 3 por partido L/E/V.

2. `/api/live/markets`
   - Debe devolver las filas L/E/V creadas por `BETLIVE_ENGINE`.

3. `/api/events?live=true`
   - Debe mostrar los partidos LIVE y sus mercados.

API-Football, si está disponible, solo enriquece los datos. Un fallo o respuesta vacía del proveedor no debe borrar/cerrar eventos ni impedir que el motor interno genere L/E/V.

V6 también limita el intervalo del ciclo a 60 segundos como máximo, para evitar que un valor accidental de Render como 27000000 ms deje el sistema horas sin actualizar.
