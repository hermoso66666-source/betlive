# BetLive V8 — corrección OPEN → LIVE

La captura mostró 15 fixtures de API-Football pero 0 eventos LIVE en la BD. V8 corrige la transición de estado:

- `/fixtures?live=all` se trata como feed LIVE: cualquier fixture no finalizado se normaliza como `LIVE`.
- Se reconcilian los fixtures con el evento existente por `external_id` o por equipos + ventana temporal.
- Si un evento ya estaba `LIVE`, una respuesta genérica `OPEN` no puede bajarlo accidentalmente a `OPEN`.
- Después de actualizar el estado, el motor interno genera L/E/V sin necesitar `/odds/live`.
- Se añade una prueba de regresión para el caso exacto observado.

Después del deploy, `/api/health` debe mostrar `liveEvents > 0` cuando `/fixtures?live=all` entregue partidos en vivo y `openInternalMarkets > 0`.
