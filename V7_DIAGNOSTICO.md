# BetLive V7 — diagnóstico

La captura mostraba `{"error":"Endpoint no encontrado"}` porque se estaba consultando `/api/heath`.
La ruta correcta siempre fue `/api/health`; V7 agrega también el alias `/api/heath`.

V7 agrega:
- alias `/api/heath`;
- auto-reparación L/E/V al consultar `/api/events?live=true`;
- endpoint admin `POST /api/admin/markets/repair`;
- mensajes de error más claros;
- mantiene el failover y el motor independiente de V6.

Prueba:
1. `/api/health`
2. `/api/heath` (debe devolver el mismo diagnóstico)
3. `/api/live/markets`
4. `/api/events?live=true`

Si `databaseState.liveEvents` es 0, el problema es el feed/entrada de partidos, no la visibilidad del mercado.
